import Secret from 'gi://Secret?version=1';

const ATTRIBUTES = {
    account: 'smtp',
    extension: 'website-monitor@lefred',
};

let _schema = null;

function getSchema() {
    _schema ??= Secret.Schema.new(
        'org.gnome.shell.extensions.website-monitor.smtp',
        Secret.SchemaFlags.NONE,
        {
            account: Secret.SchemaAttributeType.STRING,
            extension: Secret.SchemaAttributeType.STRING,
        }
    );
    return _schema;
}

export function lookupPassword() {
    return new Promise((resolve, reject) => {
        Secret.password_lookup(
            getSchema(),
            ATTRIBUTES,
            null,
            (_source, result) => {
                try {
                    resolve(Secret.password_lookup_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

export function storePassword(password) {
    return new Promise((resolve, reject) => {
        Secret.password_store(
            getSchema(),
            ATTRIBUTES,
            Secret.COLLECTION_DEFAULT,
            'Website Monitor SMTP password',
            password,
            null,
            (_source, result) => {
                try {
                    resolve(Secret.password_store_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

export function clearPassword() {
    return new Promise((resolve, reject) => {
        Secret.password_clear(
            getSchema(),
            ATTRIBUTES,
            null,
            (_source, result) => {
                try {
                    resolve(Secret.password_clear_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}
