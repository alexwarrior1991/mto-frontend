import {Button, Group, Modal, Stack, Text, TextInput} from '@mantine/core'
import {useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {deleteWholeTrack} from '../../api/configuration/masters.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {nameOf, wholeTrackDeletedText} from './masterResources.js'
import {mastersKey, useMasterMutation} from './useMasters.js'

/**
 * Borrar una vía entera (DELETE /tracks/{id}?cascade=true): la vía con todo lo suyo, en el servicio y
 * en una sola transacción. No se deshace y son miles de filas, así que la confirmación dice
 * exactamente qué se borra y el botón no se activa hasta escribir el nombre de la vía.
 *
 * Mientras corre, el botón carga y el diálogo no se cierra: con miles de perfiles tarda varios
 * segundos. Al acabar bien se avisa y se releen las listas. Si falla se cierra, como el borrado normal,
 * y el aviso lo da queryClient.js: un 409 BUS-002 (algo de otra vía la usa) con el detalle del
 * servicio. También entonces se releen las listas, porque de una respuesta que no llegó (el gateway
 * corta a los 15 s) no se sabe si el servicio terminó.
 */
export default function TrackWholeDeleteModal({track, onClose}) {
    const queryClient = useQueryClient()
    const name = nameOf(track)
    const [typed, setTyped] = useState('')
    const removing = useMasterMutation(() => deleteWholeTrack(track.id))
    const busy = removing.isPending

    const confirm = () => {
        removing.mutate(undefined, {
            onSuccess: () => {
                notifySuccess(wholeTrackDeletedText(name))
                onClose()
            },
            onError: () => {
                void queryClient.invalidateQueries({queryKey: mastersKey()})
                onClose()
            },
        })
    }

    return (
        <Modal opened onClose={onClose} title={`Borrar la vía entera ${name}`} closeOnClickOutside={!busy} closeOnEscape={!busy}
               withCloseButton={!busy}>
            <Stack>
                <Text size="sm">
                    Se borra la vía con todo lo suyo: sus perfiles con sus ménsulas y sus brazos, sus seccionadores, sus aisladores con
                    sus agujas y sus accesos a vía. No se puede deshacer.
                </Text>
                <Text size="sm">
                    Si algo de otra vía la usa, el servicio no borra nada y dice qué lo impide. Con miles de perfiles puede tardar
                    varios segundos: si la respuesta no llega, recarga la lista antes de repetirlo.
                </Text>
                <TextInput label="Escribe el nombre de la vía para confirmar" description={name} value={typed} disabled={busy}
                           autoComplete="off" data-autofocus onChange={(event) => setTyped(event.currentTarget.value)}/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button color="red" loading={busy} disabled={typed.trim() !== name.trim()} onClick={confirm}>
                        Borrar la vía entera
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
