import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gst from 'gi://Gst?version=1.0';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {lookupPassword, storePassword} from './secretStore.js';

const State = Object.freeze({
    DISABLED: 'disabled',
    CHECKING: 'checking',
    HEALTHY: 'healthy',
    SLOW: 'slow',
    DOWN: 'down',
});

const HistoryMenuItem = GObject.registerClass(
class HistoryMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(extension) {
        super._init();
        this._extension = extension;

        this.label = new St.Label({
            text: _('Recent checks…'),
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.label);
        this.add_child(PopupMenu.arrowIcon(St.Side.RIGHT));
    }

    activate() {
        // Do not emit PopupBaseMenuItem::activate: the parent menu must remain
        // open while the cascading history popup is visible.
        this._extension.toggleHistoryPopup(this);
    }
});

const MonitorIndicator = GObject.registerClass(
class MonitorIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('Website Monitor'));
        this._extension = extension;

        this._dot = new St.Widget({
            style_class: 'website-monitor-dot',
            accessible_name: _('Website status unknown'),
        });
        this.add_child(this._dot);

        this._statusItem = new PopupMenu.PopupMenuItem(_('Waiting for first check'), {
            reactive: false,
        });
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._monitorSwitch = new PopupMenu.PopupSwitchMenuItem(
            _('Monitoring'),
            this._extension.monitoringEnabled
        );
        this._monitorSwitch.connect('toggled', (_item, enabled) =>
            this._extension.setMonitoringEnabled(enabled));
        this.menu.addMenuItem(this._monitorSwitch);

        this._historyItem = new HistoryMenuItem(this._extension);
        this.menu.addMenuItem(this._historyItem);
        this.setHistoryCount(0);
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (!open)
                this._extension.closeHistoryPopup();
        });

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._checkItem = new PopupMenu.PopupMenuItem(_('Check now'));
        this._checkItem.connect('activate', () => this._extension.checkNow());
        this.menu.addMenuItem(this._checkItem);

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(settingsItem);
    }

    setState(state, message) {
        this._dot.remove_style_class_name('website-monitor-dot-green');
        this._dot.remove_style_class_name('website-monitor-dot-orange');
        this._dot.remove_style_class_name('website-monitor-dot-red');

        const descriptions = {
            [State.DISABLED]: _('Website monitoring is disabled'),
            [State.CHECKING]: _('Checking website'),
            [State.HEALTHY]: _('Website is available'),
            [State.SLOW]: _('Website is responding slowly'),
            [State.DOWN]: _('Website is unavailable'),
        };

        if (state === State.HEALTHY)
            this._dot.add_style_class_name('website-monitor-dot-green');
        else if (state === State.SLOW)
            this._dot.add_style_class_name('website-monitor-dot-orange');
        else if (state === State.DOWN)
            this._dot.add_style_class_name('website-monitor-dot-red');

        this._dot.accessible_name = descriptions[state];
        this._statusItem.label.text = message;
    }

    setMonitoringEnabled(enabled) {
        this._monitorSwitch.setToggleState(enabled);
        this._checkItem.setSensitive(enabled);
    }

    setHistoryCount(count) {
        this._historyItem.label.text = count === 0
            ? _('Recent checks…')
            : _('Recent checks (%d)…').format(count);
    }
});

const WebsiteHistoryPopup = GObject.registerClass(
class WebsiteHistoryPopup extends St.BoxLayout {
    _init(entries) {
        super._init({
            vertical: true,
            reactive: true,
            can_focus: true,
            style_class: 'popup-menu-content website-monitor-history-popup',
        });
        this._list = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'website-monitor-history-list',
        });
        const scrollView = new St.ScrollView({
            x_expand: true,
            y_expand: true,
            style_class: 'website-monitor-history-scroll',
        });
        scrollView.set_child(this._list);
        this.add_child(scrollView);

        this.setEntries(entries);
        Main.uiGroup.add_child(this);
        Main.uiGroup.set_child_above_sibling(this, null);
    }

    setEntries(entries) {
        for (const child of this._list.get_children())
            child.destroy();

        if (entries.length === 0) {
            this._list.add_child(new St.Label({
                text: _('No checks yet'),
                style_class: 'website-monitor-history-empty',
                x_align: Clutter.ActorAlign.CENTER,
            }));
            return;
        }

        for (const entry of entries) {
            const duration = entry.elapsedMs === null
                ? _('no response')
                : _('%d ms').format(entry.elapsedMs);
            this._list.add_child(new St.Label({
                text: `${entry.time}   ${entry.status}   ${duration}   ${entry.detail}`,
                style_class: `website-monitor-history-row website-monitor-history-${entry.state}`,
                x_align: Clutter.ActorAlign.START,
            }));
        }
    }
});

const WebsiteAlertOverlay = GObject.registerClass(
class WebsiteAlertOverlay extends St.Widget {
    _init(url, failureCount, onClosed) {
        super._init({
            reactive: true,
            can_focus: true,
            style_class: 'website-monitor-alert-overlay',
            layout_manager: new Clutter.BinLayout(),
        });
        this._onClosed = onClosed;

        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'website-monitor-alert-box',
        });
        box.add_child(new St.Label({
            text: _('Website unavailable'),
            style_class: 'website-monitor-alert-title',
            x_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({
            text: _('%s did not answer successfully for %d consecutive checks.')
                .format(url, failureCount),
            style_class: 'website-monitor-alert-message',
            x_align: Clutter.ActorAlign.CENTER,
        }));
        const dismissButton = new St.Button({
            label: _('Dismiss'),
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'modal-dialog-button button website-monitor-dismiss',
        });
        dismissButton.connect('clicked', () => this.close());
        box.add_child(dismissButton);
        this.add_child(box);

        this.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));

        this.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        Main.uiGroup.add_child(this);
        Main.uiGroup.set_child_above_sibling(this, null);
        dismissButton.grab_key_focus();
    }

    close() {
        if (!this.get_parent())
            return;

        this._onClosed?.();
        this.destroy();
    }
});

export default class WebsiteMonitorExtension extends Extension {
    enable() {
        Gst.init(null);
        this._settings = this.getSettings();
        this._indicator = new MonitorIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._session = new Soup.Session({
            user_agent: 'GNOME Website Monitor/1.0',
        });
        this._failures = 0;
        this._history = [];
        this._alertShownForOutage = false;
        this._alertPendingAfterUnlock = false;
        this._emailSentForOutage = false;
        this._checkInProgress = false;
        this._checkAfterCurrent = false;
        this._timerId = 0;
        this._cancellable = null;
        this._alertOverlay = null;
        this._historyPopup = null;
        this._customSoundPlayer = null;
        this._customSoundBus = null;
        this._customSoundMessageId = 0;
        this._customSoundLoopId = 0;
        this._defaultSoundTimerId = 0;
        this._sessionModeChangedId = Main.sessionMode.connect(
            'updated',
            () => this._onSessionModeUpdated()
        );

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'test-alert-request') {
                this.testAlert();
                return;
            }
            if (key === 'test-email-request') {
                this._sendEmail(true);
                return;
            }
            if (key === 'sound-alert-enabled') {
                if (!this._settings.get_boolean('sound-alert-enabled'))
                    this._stopAlertSound();
                return;
            }
            if (key === 'alert-sound-uri')
                return;
            if (key === 'monitor-enabled') {
                this._applyMonitoringState();
                return;
            }
            if (key === 'history-size') {
                this._trimHistory();
                return;
            }
            if (key === 'history-popup-side') {
                this.closeHistoryPopup();
                return;
            }
            if ([
                'email-enabled',
                'smtp-host',
                'smtp-port',
                'smtp-security',
                'smtp-username',
                'smtp-password',
                'email-from',
                'email-recipients',
            ].includes(key))
                return;

            if (this.monitoringEnabled) {
                this._restartTimer();
                this.checkNow();
            }
        });
        this._applyMonitoringState();
    }

    get monitoringEnabled() {
        return this._settings?.get_boolean('monitor-enabled') ?? false;
    }

    setMonitoringEnabled(enabled) {
        if (!this._settings || this.monitoringEnabled === enabled)
            return;

        this._settings.set_boolean('monitor-enabled', enabled);
    }

    _resetFailureState() {
        this._failures = 0;
        this._alertShownForOutage = false;
        this._alertPendingAfterUnlock = false;
        this._emailSentForOutage = false;
        this._alertOverlay?.close();
        this._alertOverlay = null;
    }

    _onSessionModeUpdated() {
        if (Main.sessionMode.isLocked) {
            if (this._alertOverlay) {
                this._alertOverlay.close();
                this._alertOverlay = null;
                this._stopAlertSound();
                this._alertPendingAfterUnlock =
                    this._failures >= this._settings.get_uint('failure-threshold');
            }
            this.closeHistoryPopup();
            return;
        }

        if (this._alertPendingAfterUnlock &&
            this._failures >= this._settings.get_uint('failure-threshold')) {
            this._alertPendingAfterUnlock = false;
            this._alertShownForOutage = this._showAlert();
        }
    }

    _addHistory(state, elapsedMs, detail) {
        const statusNames = {
            [State.HEALTHY]: _('Available'),
            [State.SLOW]: _('Slow'),
            [State.DOWN]: _('Unavailable'),
        };
        this._history.unshift({
            time: GLib.DateTime.new_now_local().format('%H:%M:%S'),
            status: statusNames[state],
            state,
            elapsedMs,
            detail,
        });
        this._trimHistory();
    }

    _trimHistory() {
        const limit = this._settings.get_uint('history-size');
        if (this._history.length > limit)
            this._history.length = limit;
        this._indicator.setHistoryCount(this._history.length);
        this._historyPopup?.setEntries(this._history);
    }

    toggleHistoryPopup(sourceItem) {
        if (this._historyPopup) {
            this.closeHistoryPopup();
            return;
        }

        const popup = new WebsiteHistoryPopup(this._history);
        this._historyPopup = popup;

        const [sourceX, sourceY] = sourceItem.get_transformed_position();
        const [sourceWidth] = sourceItem.get_transformed_size();
        const [, popupWidth] = popup.get_preferred_width(-1);
        const [, popupHeight] = popup.get_preferred_height(-1);
        const gap = 6;
        const side = this._settings.get_string('history-popup-side');

        let popupX;
        if (side === 'left') {
            popupX = sourceX - popupWidth - gap;
        } else if (side === 'right') {
            popupX = sourceX + sourceWidth + gap;
        } else {
            popupX = sourceX + sourceWidth + gap;
            if (popupX + popupWidth > global.stage.width)
                popupX = sourceX - popupWidth - gap;
        }
        popupX = Math.max(
            0,
            Math.min(popupX, global.stage.width - popupWidth)
        );
        const popupY = Math.max(
            0,
            Math.min(sourceY, global.stage.height - popupHeight)
        );
        popup.set_position(Math.round(popupX), Math.round(popupY));
    }

    closeHistoryPopup() {
        this._historyPopup?.destroy();
        this._historyPopup = null;
    }

    _applyMonitoringState() {
        const enabled = this.monitoringEnabled;
        this._resetFailureState();
        this._indicator.setMonitoringEnabled(enabled);
        this._checkAfterCurrent = enabled && this._checkInProgress;

        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
        this._cancellable?.cancel();

        if (enabled) {
            this._restartTimer();
            this.checkNow();
        } else {
            this._indicator.setState(State.DISABLED, _('Monitoring disabled'));
        }
    }

    disable() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
        this._cancellable?.cancel();
        this._cancellable = null;
        this._session?.abort();
        this._stopAlertSound();
        this._alertOverlay?.close();
        this._alertOverlay = null;
        this.closeHistoryPopup();
        // unlock-dialog is enabled only so checks continue while locked; all
        // dismissible UI is suppressed until the normal user session returns.
        if (this._sessionModeChangedId)
            Main.sessionMode.disconnect(this._sessionModeChangedId);
        this._sessionModeChangedId = 0;
        if (this._settingsChangedId)
            this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = 0;
        this._indicator?.destroy();
        this._indicator = null;
        this._session = null;
        this._settings = null;
    }

    _restartTimer() {
        if (this._timerId)
            GLib.Source.remove(this._timerId);

        const interval = this._settings.get_uint('check-interval');
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            interval,
            () => {
                this.checkNow();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    async checkNow() {
        if (!this.monitoringEnabled || this._checkInProgress || !this._session)
            return;

        let url = this._settings.get_string('website-url').trim();
        if (!url) {
            this._indicator.setState(State.DOWN, _('No website configured'));
            return;
        }
        if (!/^https?:\/\//i.test(url))
            url = `https://${url}`;

        let message;
        try {
            message = Soup.Message.new('GET', url);
        } catch (error) {
            this._addHistory(State.DOWN, null, _('invalid address'));
            this._recordFailure(_('Invalid website address'));
            return;
        }
        if (!message) {
            this._addHistory(State.DOWN, null, _('invalid address'));
            this._recordFailure(_('Invalid website address'));
            return;
        }

        this._checkInProgress = true;
        this._indicator.setState(State.CHECKING, _('Checking…'));
        this._session.timeout = this._settings.get_uint('request-timeout');
        this._cancellable = new Gio.Cancellable();
        const started = GLib.get_monotonic_time();

        try {
            await this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                this._cancellable
            );
            const elapsedMs = Math.round((GLib.get_monotonic_time() - started) / 1000);
            const status = message.get_status();

            if (status < 200 || status >= 400) {
                this._addHistory(State.DOWN, elapsedMs, `HTTP ${status}`);
                this._recordFailure(_('HTTP %d — failed check %d/%d').format(
                    status,
                    this._failures + 1,
                    this._settings.get_uint('failure-threshold')
                ));
            } else {
                this._failures = 0;
                this._alertShownForOutage = false;
                this._alertPendingAfterUnlock = false;
                this._emailSentForOutage = false;
                const isSlow = this._settings.get_boolean('slow-threshold-enabled') &&
                    elapsedMs >= this._settings.get_uint('slow-threshold-ms');
                this._addHistory(
                    isSlow ? State.SLOW : State.HEALTHY,
                    elapsedMs,
                    `HTTP ${status}`
                );
                this._indicator.setState(
                    isSlow ? State.SLOW : State.HEALTHY,
                    isSlow
                        ? _('Slow — %d ms (HTTP %d)').format(elapsedMs, status)
                        : _('Available — %d ms (HTTP %d)').format(elapsedMs, status)
                );
            }
        } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                const elapsedMs = Math.round(
                    (GLib.get_monotonic_time() - started) / 1000
                );
                this._addHistory(State.DOWN, elapsedMs, _('request failed'));
                this._recordFailure(_('Unavailable — failed check %d/%d').format(
                    this._failures + 1,
                    this._settings.get_uint('failure-threshold')
                ));
            }
        } finally {
            this._checkInProgress = false;
            this._cancellable = null;
            if (this._checkAfterCurrent && this.monitoringEnabled) {
                this._checkAfterCurrent = false;
                this.checkNow();
            }
        }
    }

    _recordFailure(message) {
        this._failures++;
        this._indicator.setState(State.DOWN, message);

        const threshold = this._settings.get_uint('failure-threshold');
        if (this._failures >= threshold &&
            this._settings.get_boolean('email-enabled') &&
            !this._emailSentForOutage) {
            this._emailSentForOutage = true;
            this._sendEmail(false);
        }

        if (this._failures >= threshold && !this._alertShownForOutage) {
            if (Main.sessionMode.isLocked) {
                this._alertShownForOutage = true;
                this._alertPendingAfterUnlock = true;
                this._indicator.setState(
                    State.DOWN,
                    _('ALERT — deferred until unlock')
                );
                this._playLockedAlertSound();
            } else {
                this._alertShownForOutage = this._showAlert();
            }
        }
    }

    testAlert() {
        if (!this._settings)
            return;

        this._failures = Math.max(
            this._failures,
            this._settings.get_uint('failure-threshold')
        );
        this._alertShownForOutage = this._showAlert();
    }

    _emailSetting(key) {
        return this._settings.get_string(key).replace(/[\r\n]/g, '').trim();
    }

    async _getSmtpPassword() {
        const legacyPassword = this._settings.get_string('smtp-password');
        if (legacyPassword) {
            await storePassword(legacyPassword);
            this._settings.set_string('smtp-password', '');
            return legacyPassword;
        }

        return await lookupPassword() ?? '';
    }

    async _sendEmail(isTest) {
        try {
            const curl = GLib.find_program_in_path('curl');
            if (!curl)
                throw new Error(_('curl is not installed'));

            const host = this._emailSetting('smtp-host');
            const username = this._emailSetting('smtp-username');
            const password = await this._getSmtpPassword();
            const from = this._emailSetting('email-from');
            const recipients = this._emailSetting('email-recipients')
                .split(',')
                .map(address => address.trim())
                .filter(Boolean);

            if (!host)
                throw new Error(_('SMTP server is required'));
            if (!from || !from.includes('@'))
                throw new Error(_('A valid sender address is required'));
            if (recipients.length === 0 ||
                recipients.some(address => !address.includes('@')))
                throw new Error(_('At least one valid recipient is required'));

            const security = this._settings.get_string('smtp-security');
            const port = this._settings.get_uint('smtp-port');
            const scheme = security === 'tls' ? 'smtps' : 'smtp';
            const smtpUrl = `${scheme}://${host}:${port}/`;
            const args = [
                curl,
                '--silent',
                '--show-error',
                '--fail',
                '--connect-timeout',
                '15',
                '--max-time',
                '45',
                '--url',
                smtpUrl,
                '--mail-from',
                from,
            ];

            if (security === 'starttls')
                args.push('--ssl-reqd');
            if (username || password)
                args.push('--user', `${username}:${password}`);
            for (const recipient of recipients)
                args.push('--mail-rcpt', recipient);
            args.push('--upload-file', '-');

            const website = this._emailSetting('website-url');
            const subject = isTest
                ? _('Website Monitor test email')
                : _('ALERT: Website unavailable');
            const body = isTest
                ? _('This is a test email from the GNOME Website Monitor extension.')
                : _('%s has failed %d consecutive checks and is considered unavailable.')
                    .format(website, this._failures);
            const date = GLib.DateTime.new_now_local()
                .format('%a, %d %b %Y %H:%M:%S %z');
            const payload = [
                `Date: ${date}`,
                `From: ${from}`,
                `To: ${recipients.join(', ')}`,
                `Subject: ${subject}`,
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                '',
                body,
                '',
            ].join('\r\n');

            const process = Gio.Subprocess.new(
                args,
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE
            );
            const result = await new Promise((resolve, reject) => {
                process.communicate_utf8_async(
                    payload,
                    null,
                    (source, asyncResult) => {
                        try {
                            resolve(source.communicate_utf8_finish(asyncResult));
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            });
            if (!process.get_successful()) {
                const stderr = result.at(-1)?.trim() ?? '';
                throw new Error(stderr || _('SMTP delivery failed'));
            }

            console.info(`Website Monitor ${isTest ? 'test ' : ''}email sent`);
            if (isTest && !Main.sessionMode.isLocked)
                Main.notify(_('Website Monitor'), _('Test email sent successfully'));
        } catch (error) {
            console.error(`Website Monitor email failed: ${error.message}`);
            if (isTest && !Main.sessionMode.isLocked)
                Main.notifyError(_('Test email failed'), error.message);
        }
    }

    _playDefaultSound(repeat = true) {
        global.display.get_sound_player().play_from_theme(
            'dialog-warning',
            _('Website unavailable'),
            null
        );

        if (repeat && !this._defaultSoundTimerId) {
            this._defaultSoundTimerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                3,
                () => {
                    if (!this._alertOverlay) {
                        this._defaultSoundTimerId = 0;
                        return GLib.SOURCE_REMOVE;
                    }

                    try {
                        global.display.get_sound_player().play_from_theme(
                            'dialog-warning',
                            _('Website unavailable'),
                            null
                        );
                    } catch (error) {
                        console.warn(`Website Monitor repeated warning sound failed: ${error.message}`);
                    }
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }
    }

    _stopCustomSound() {
        if (this._customSoundPlayer && this._customSoundLoopId)
            this._customSoundPlayer.disconnect(this._customSoundLoopId);
        if (this._customSoundBus && this._customSoundMessageId)
            this._customSoundBus.disconnect(this._customSoundMessageId);
        if (this._customSoundBus)
            this._customSoundBus.remove_signal_watch();
        if (this._customSoundPlayer)
            this._customSoundPlayer.set_state(Gst.State.NULL);

        this._customSoundMessageId = 0;
        this._customSoundLoopId = 0;
        this._customSoundBus = null;
        this._customSoundPlayer = null;
    }

    _stopAlertSound() {
        if (this._defaultSoundTimerId) {
            GLib.Source.remove(this._defaultSoundTimerId);
            this._defaultSoundTimerId = 0;
        }
        this._stopCustomSound();
    }

    _playCustomSound(uri, loop = true) {
        this._stopCustomSound();

        const file = Gio.File.new_for_uri(uri);
        if (!file.query_exists(null))
            throw new Error(_('The selected MP3 file no longer exists'));

        const player = Gst.ElementFactory.make('playbin', null);
        if (!player)
            throw new Error(_('GStreamer playback is not available'));

        player.set_property('uri', uri);
        const bus = player.get_bus();
        bus.add_signal_watch();

        this._customSoundPlayer = player;
        this._customSoundBus = bus;
        if (loop) {
            this._customSoundLoopId = player.connect('about-to-finish', () => {
                // Reassigning the same URI queues the file again for gapless
                // playback before the current pass reaches EOS.
                player.set_property('uri', uri);
            });
        }
        this._customSoundMessageId = bus.connect('message', (_bus, message) => {
            if (message.type === Gst.MessageType.EOS) {
                if (loop) {
                    // Some pipelines do not emit about-to-finish early enough.
                    // Restart on EOS as a second loop mechanism.
                    player.set_state(Gst.State.NULL);
                    player.set_property('uri', uri);
                    player.set_state(Gst.State.PLAYING);
                } else {
                    this._stopCustomSound();
                }
            } else if (message.type === Gst.MessageType.ERROR) {
                const [error, debug] = message.parse_error();
                console.warn(`Website Monitor MP3 playback failed: ${error.message}; ${debug ?? ''}`);
                this._stopCustomSound();
                try {
                    this._playDefaultSound(loop);
                } catch (fallbackError) {
                    console.warn(`Website Monitor fallback sound failed: ${fallbackError.message}`);
                }
            }
        });

        if (player.set_state(Gst.State.PLAYING) === Gst.StateChangeReturn.FAILURE) {
            this._stopCustomSound();
            throw new Error(_('GStreamer could not start MP3 playback'));
        }
    }

    _playLockedAlertSound() {
        if (!this._settings.get_boolean('sound-alert-enabled'))
            return;

        try {
            const soundUri = this._settings.get_string('alert-sound-uri');
            if (soundUri)
                this._playCustomSound(soundUri, false);
            else
                this._playDefaultSound(false);
        } catch (error) {
            console.warn(`Website Monitor locked alert sound failed: ${error.message}`);
            try {
                this._playDefaultSound(false);
            } catch (fallbackError) {
                console.warn(`Website Monitor fallback sound failed: ${fallbackError.message}`);
            }
        }
    }

    _showAlert() {
        const url = this._settings.get_string('website-url').trim();
        const alertMessage = _('%s failed %d consecutive checks.')
            .format(url, this._failures);

        // A repeated manual test replaces the previous alert and its audio.
        this._alertOverlay?.close();
        this._alertOverlay = null;
        this._stopAlertSound();

        this._indicator.setState(
            State.DOWN,
            _('ALERT — failed check %d/%d').format(
                this._failures,
                this._settings.get_uint('failure-threshold')
            )
        );

        // Always request a critical Shell notification as a second visible
        // channel, even if the large overlay succeeds.
        Main.notifyError(_('Website unavailable'), alertMessage);

        // GStreamer's playbin handles MP3 decoding. GNOME's event-sound player
        // remains the fallback for an unset or unplayable custom sound.
        if (this._settings.get_boolean('sound-alert-enabled')) {
            try {
                const soundUri = this._settings.get_string('alert-sound-uri');
                if (soundUri)
                    this._playCustomSound(soundUri);
                else
                    this._playDefaultSound();
            } catch (error) {
                console.warn(`Website Monitor could not play alert sound: ${error.message}`);
                try {
                    this._playDefaultSound();
                } catch (fallbackError) {
                    console.warn(`Website Monitor fallback sound failed: ${fallbackError.message}`);
                }
            }
        }

        try {
            this._alertOverlay = new WebsiteAlertOverlay(url, this._failures, () => {
                this._alertOverlay = null;
                this._stopAlertSound();
            });
            return true;
        } catch (error) {
            this._alertOverlay?.destroy();
            this._alertOverlay = null;
            this._stopAlertSound();
            console.error(`Website Monitor could not show alert: ${error.stack ?? error}`);
            return false;
        }
    }
}
