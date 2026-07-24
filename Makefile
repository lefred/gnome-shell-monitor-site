UUID := website-monitor@lefred
FILES := metadata.json extension.js prefs.js stylesheet.css schemas

.PHONY: all schema package install clean

all: schema

schema:
	glib-compile-schemas schemas

package: clean
	gnome-extensions pack --force

install: package
	gnome-extensions install --force $(UUID).shell-extension.zip

clean:
	rm -f schemas/gschemas.compiled $(UUID).shell-extension.zip
