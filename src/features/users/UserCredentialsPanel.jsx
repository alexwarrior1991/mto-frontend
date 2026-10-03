import {Stack, Text} from '@mantine/core'
import {IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {credentialTypeLabel} from '../../api/users/users.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {credentialName, credentialWarning} from './userTexts.js'
import {useCredentials, useDeleteCredential} from './useUsers.js'

const COLUMNS = [
    {key: 'type', label: 'Tipo', render: (credential) => credentialTypeLabel(credential.type)},
    {key: 'userLabel', label: 'Etiqueta', render: (credential) => credential.userLabel ?? ''},
    {key: 'createdAt', label: 'Creada', render: (credential) => formatDateTime(credential.createdAt)},
]

/**
 * La pestaña «Credenciales» de la ficha (el port de UserCredentialsPanel): lo que Keycloak guarda para
 * autenticar a la persona, sin el secreto ni cómo se almacena. Con users-credentials-write se quita
 * una, con confirmación, y la de una contraseña avisa de que sin ella no se puede entrar. Haya ido
 * bien o no, la lista se relee.
 */
export default function UserCredentialsPanel({userId, canRemove}) {
    const credentials = useCredentials(userId)
    const removing = useDeleteCredential(userId)
    const [confirming, setConfirming] = useState(null)

    const remove = () => {
        const credential = confirming
        removing.mutate(credential, {
            onSuccess: () => notifySuccess(`Credencial quitada: ${credentialTypeLabel(credential.type)}`),
            onSettled: () => setConfirming(null),
        })
    }

    return (
        <Stack>
            <Text size="sm">Lo que Keycloak guarda para autenticar a la persona. Ni el secreto ni cómo se almacena salen del servicio.</Text>
            <DataTable ariaLabel="Credenciales" columns={COLUMNS} rows={credentials.data ?? []} loading={credentials.isPending}
                       emptyText={credentials.isError ? 'No se han podido leer las credenciales.' : 'Sin credenciales.'}
                       rowActions={canRemove
                           ? (credential) => (
                               <RowActionButton label={`Quitar ${credentialName(credential)}`} tooltip="Quitar la credencial"
                                                icon={IconTrash} color="red" onClick={() => setConfirming(credential)}/>
                           )
                           : null}/>
            {confirming && (
                <ConfirmModal title={`Quitar ${credentialTypeLabel(confirming.type)}`} confirmLabel="Quitar" loading={removing.isPending}
                              onConfirm={remove} onClose={() => setConfirming(null)}>
                    {credentialWarning(confirming)}
                </ConfirmModal>
            )}
        </Stack>
    )
}
