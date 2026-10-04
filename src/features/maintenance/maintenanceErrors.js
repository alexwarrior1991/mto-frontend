import {ApiError} from '../../api/errors.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'

/**
 * Lo que hace un editor de mantenimiento cuando el servicio dice que no: los errores por campo, en su
 * campo (las propiedades del formulario se llaman como las de la petición), y lo que no cae en ninguno,
 * como aviso. El diálogo sigue abierto con lo escrito: una versión vieja (409 CON-001) pide recargar y
 * un estado que no admite el cambio (409 TRN-001) lo dice.
 *
 * @param {object} form el formulario de @mantine/form
 * @param {object} [options] los alias de applyServerErrors
 */
export function saveErrors(form, options = {}) {
    return (error) => {
        if (error instanceof ApiError && error.hasFieldErrors) {
            notifyMessages(applyServerErrors(form, error, options))
        } else {
            notifyApiError(error)
        }
    }
}
