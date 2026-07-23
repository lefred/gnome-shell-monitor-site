import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function createSpinRow(settings, key, title, subtitle, lower, upper, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: step * 10,
            value: settings.get_uint(key),
        }),
    });
    row.connect('notify::value', () => settings.set_uint(key, Math.round(row.value)));
    settings.connect(`changed::${key}`, () => {
        const value = settings.get_uint(key);
        if (row.value !== value)
            row.value = value;
    });
    return row;
}

function soundName(uri) {
    if (!uri)
        return _('Default desktop warning sound');

    return Gio.File.new_for_uri(uri).get_basename() ?? uri;
}

export default class WebsiteMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(640, 520);
        window.search_enabled = true;

        const page = new Adw.PreferencesPage({
            title: _('Website Monitor'),
            icon_name: 'network-transmit-receive-symbolic',
        });
        window.add(page);

        const targetGroup = new Adw.PreferencesGroup({
            title: _('Website'),
            description: _('The site is checked with an HTTP GET request.'),
        });
        page.add(targetGroup);

        const enabledRow = new Adw.SwitchRow({
            title: _('Enable monitoring'),
            subtitle: _('The same switch is available in the top-bar indicator menu'),
        });
        settings.bind(
            'monitor-enabled',
            enabledRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        targetGroup.add(enabledRow);

        const urlRow = new Adw.EntryRow({
            title: _('Website address'),
            text: settings.get_string('website-url'),
        });
        urlRow.connect('changed', () =>
            settings.set_string('website-url', urlRow.text.trim()));
        settings.connect('changed::website-url', () => {
            const value = settings.get_string('website-url');
            if (urlRow.text !== value)
                urlRow.text = value;
        });
        targetGroup.add(urlRow);

        const slowSwitch = new Adw.SwitchRow({
            title: _('Detect slow responses'),
            subtitle: _('Show orange when the response exceeds the optional threshold'),
            active: settings.get_boolean('slow-threshold-enabled'),
        });
        settings.bind(
            'slow-threshold-enabled',
            slowSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        targetGroup.add(slowSwitch);

        const slowRow = createSpinRow(
            settings,
            'slow-threshold-ms',
            _('Slow response threshold'),
            _('Milliseconds'),
            100,
            60000,
            100
        );
        settings.bind(
            'slow-threshold-enabled',
            slowRow,
            'sensitive',
            Gio.SettingsBindFlags.GET
        );
        targetGroup.add(slowRow);

        const checksGroup = new Adw.PreferencesGroup({
            title: _('Checks and alerts'),
        });
        page.add(checksGroup);
        checksGroup.add(createSpinRow(
            settings,
            'check-interval',
            _('Seconds between checks'),
            _('Minimum: 5 seconds'),
            5,
            86400,
            5
        ));
        checksGroup.add(createSpinRow(
            settings,
            'failure-threshold',
            _('Failed checks before alerting'),
            _('Consecutive failures; defaults to 3'),
            1,
            100,
            1
        ));
        checksGroup.add(createSpinRow(
            settings,
            'request-timeout',
            _('Request timeout'),
            _('Seconds to wait before a check fails'),
            1,
            120,
            1
        ));

        const soundGroup = new Adw.PreferencesGroup({
            title: _('Alert sound'),
            description: _('Choose an MP3 to play when the failure alert appears.'),
        });
        page.add(soundGroup);

        const soundRow = new Adw.ActionRow({
            title: _('Sound file'),
            subtitle: soundName(settings.get_string('alert-sound-uri')),
        });
        soundGroup.add(soundRow);

        const chooseSoundButton = new Gtk.Button({
            label: _('Choose…'),
            valign: Gtk.Align.CENTER,
        });
        chooseSoundButton.connect('clicked', () => {
            const chooser = new Gtk.FileChooserNative({
                title: _('Choose an alert sound'),
                transient_for: window,
                modal: true,
                action: Gtk.FileChooserAction.OPEN,
                accept_label: _('Choose'),
                cancel_label: _('Cancel'),
            });
            const filter = new Gtk.FileFilter({
                name: _('MP3 audio files'),
            });
            filter.add_mime_type('audio/mpeg');
            filter.add_pattern('*.mp3');
            filter.add_pattern('*.MP3');
            chooser.add_filter(filter);

            chooser.connect('response', (_chooser, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const file = chooser.get_file();
                    if (file)
                        settings.set_string('alert-sound-uri', file.get_uri());
                }
                chooser.destroy();
            });
            chooser.show();
        });
        soundRow.add_suffix(chooseSoundButton);

        const clearSoundButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            tooltip_text: _('Use the default desktop warning sound'),
            valign: Gtk.Align.CENTER,
        });
        clearSoundButton.connect('clicked', () =>
            settings.set_string('alert-sound-uri', ''));
        soundRow.add_suffix(clearSoundButton);

        const updateSoundRow = () => {
            const uri = settings.get_string('alert-sound-uri');
            soundRow.subtitle = soundName(uri);
            clearSoundButton.sensitive = Boolean(uri);
        };
        settings.connect('changed::alert-sound-uri', updateSoundRow);
        updateSoundRow();

        const testAlertRow = new Adw.ActionRow({
            title: _('Test alert'),
            subtitle: _('Show the overlay and play the selected sound'),
        });
        const testAlertButton = new Gtk.Button({
            label: _('Test alert'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        testAlertButton.connect('clicked', () => {
            const current = settings.get_uint('test-alert-request');
            settings.set_uint(
                'test-alert-request',
                current === 0xffffffff ? 0 : current + 1
            );
        });
        testAlertRow.add_suffix(testAlertButton);
        soundGroup.add(testAlertRow);

        const infoGroup = new Adw.PreferencesGroup({
            title: _('Status colors'),
        });
        page.add(infoGroup);
        infoGroup.add(new Adw.ActionRow({
            title: _('Green'),
            subtitle: _('The website responded successfully within the threshold'),
            icon_name: 'emblem-ok-symbolic',
        }));
        infoGroup.add(new Adw.ActionRow({
            title: _('Orange'),
            subtitle: _('The website responded successfully but slowly'),
            icon_name: 'dialog-warning-symbolic',
        }));
        infoGroup.add(new Adw.ActionRow({
            title: _('Red'),
            subtitle: _('The request failed, timed out, or returned an HTTP error'),
            icon_name: 'dialog-error-symbolic',
        }));
    }
}
