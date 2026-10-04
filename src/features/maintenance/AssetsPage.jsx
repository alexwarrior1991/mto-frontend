import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useDebouncedValue} from '@mantine/hooks'
import {IconBan, IconCircleCheck, IconHistory, IconListCheck, IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {endOfDayInstant} from '../../api/dates.js'
import {assetRevisionsPath, canReactivate, isDisabledLocally, isSynchronizedAsset} from '../../api/maintenance/assets.js'
import {ASSET_TYPE} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import AssetEditorModal from './AssetEditorModal.jsx'
import AssetOrdersModal from './AssetOrdersModal.jsx'
import {ReferenceSelect} from './MaintenancePickers.jsx'
import {assetState, countText, describeAsset, kpRange} from './maintenanceTexts.js'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {MAINTENANCE_PAGE_SIZE, useAssetAction, useAssetList} from './useMaintenance.js'

const SEARCH_DELAY_MS = 300

/**
 * Los activos de catenaria (el port de AssetsView), paginados y filtrados en el servidor.
 *
 * - Un tramo de vía se da de alta aquí y se modifica entero. Perfiles, seccionadores y aisladores
 *   llegan de mto-configuration, y aquí solo cambian su descripción y su intervalo preventivo.
 * - Desactivar es un DELETE (maintenance-delete) y reactivar, un PATCH con enabled=true
 *   (maintenance-write), en cualquier activo: lo que decide mantenimiento no lo deshace ningún evento de
 *   datos maestros.
 * - Solo se reactiva lo que se desactivó aquí, y no si mto-configuration lo tiene desactivado (el
 *   servicio respondería 409 AST-001). El estado dice quién lo desactivó.
 * - Sin config-read no hay vías entre las que elegir, y la vía de un tramo es obligatoria: no se ofrece
 *   el alta.
 *
 * La columna de acciones existe siempre: las órdenes de un activo y su historial son lectura.
 */
export default function AssetsPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const canDelete = session.has(P.MAINTENANCE_DELETE)
    const names = useConfigurationNames({stations: true, tracks: true})

    const [type, setType] = useState(null)
    const [trackId, setTrackId] = useState(null)
    const [stationId, setStationId] = useState(null)
    const [packageId, setPackageId] = useState(null)
    const [enabled, setEnabled] = useState(null)
    const [name, setName] = useState('')
    const [debouncedName] = useDebouncedValue(name, SEARCH_DELAY_MS)
    const [dueBy, setDueBy] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {
        type, trackId, stationId, executionPackageId: packageId, enabled, name: debouncedName.trim(),
        preventiveDueBefore: dueBy ? endOfDayInstant(dueBy) : null,
    }
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useAssetList({...filters, page, sort})
    const filtering = Object.values(filters).some((value) => value !== null && value !== '')

    // null: cerrado; {asset: null}: alta; {asset}: modificación.
    const [editing, setEditing] = useState(null)
    const [orders, setOrders] = useState(null)
    const [history, setHistory] = useState(null)
    const [disabling, setDisabling] = useState(null)
    const acting = useAssetAction()

    const disable = () => {
        const asset = disabling
        acting.mutate({action: 'disable', asset}, {
            onSuccess: () => notifySuccess(`Desactivado ${assetLabel(asset)}`),
            onSettled: () => setDisabling(null),
        })
    }
    const enable = (asset) => acting.mutate({action: 'enable', asset}, {onSuccess: () => notifySuccess(`Reactivado ${assetLabel(asset)}`)})

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (asset) => asset.code},
        {key: 'name', label: 'Nombre', sortField: 'name', render: (asset) => asset.name},
        {key: 'type', label: 'Tipo', sortField: 'type', render: (asset) => ASSET_TYPE.label(asset.type)},
        {key: 'track', label: 'Vía', render: (asset) => names.trackName(asset.trackId)},
        {key: 'kp', label: 'KP', sortField: 'startKp', render: (asset) => kpRange(asset.startKp, asset.endKp)},
        {key: 'package', label: 'Paquete', render: (asset) => names.packageName(asset.executionPackageId)},
        {key: 'sectioning', label: 'Seccionamiento', render: (asset) => asset.sectioning ?? ''},
        {
            key: 'interval', label: 'Intervalo', sortField: 'preventiveIntervalDays',
            render: (asset) => (asset.preventiveIntervalDays ? `${asset.preventiveIntervalDays} d` : ''),
        },
        {key: 'nextPreventive', label: 'Próximo preventivo', render: (asset) => formatDateTime(asset.nextPreventiveDueAt)},
        {key: 'enabled', label: 'Estado', sortField: 'enabled', render: assetState},
        {key: 'source', label: 'Origen', render: (asset) => (isSynchronizedAsset(asset) ? 'mto-configuration' : 'Mantenimiento')},
    ]

    const actions = (asset) => {
        const label = assetLabel(asset)
        return (
            <>
                <RowActionButton label={`Órdenes de ${label}`} tooltip="Órdenes" icon={IconListCheck} onClick={() => setOrders(asset)}/>
                <RowActionButton label={`Historial de ${label}`} tooltip="Historial" icon={IconHistory} onClick={() => setHistory(asset)}/>
                {canWrite && (
                    <RowActionButton label={`Modificar ${label}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({asset})}/>
                )}
                {canDelete && !isDisabledLocally(asset) && (
                    <RowActionButton label={`Desactivar ${label}`} tooltip="Desactivar" icon={IconBan} color="red"
                                     onClick={() => setDisabling(asset)}/>
                )}
                {canWrite && canReactivate(asset) && (
                    <RowActionButton label={`Reactivar ${label}`} tooltip="Reactivar" icon={IconCircleCheck} onClick={() => enable(asset)}/>
                )}
            </>
        )
    }

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Tipo" placeholder="Todos" clearable w={200} data={ASSET_TYPE.selectable()} value={type} onChange={setType}/>
                <ReferenceSelect label="Vía" placeholder="Todas" w={220} options={names.trackOptions} value={trackId} onChange={setTrackId}/>
                <ReferenceSelect label="Estación" placeholder="Todas" w={220} options={names.stationOptions} value={stationId}
                                 onChange={setStationId}/>
                <ReferenceSelect label="Paquete" placeholder="Todos" w={220} options={names.packageOptions} value={packageId}
                                 onChange={setPackageId}/>
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Desactivados']} value={enabled} onChange={setEnabled}/>
                <TextInput label="Nombre" placeholder="12-2.27, HSA-NS5…" w={200} value={name} onChange={(event) => setName(event.currentTarget.value)}
                           rightSection={name ? <CloseButton size="sm" aria-label="Borrar el nombre" onClick={() => setName('')}/> : null}/>
                <DateInput label="Preventivo vence hasta" clearable w={190} valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                           placeholder="DD/MM/AAAA" value={dueBy} onChange={setDueBy}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'activo', 'activos') : ''}</Text>
                {canWrite && names.readsConfiguration && (
                    <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({asset: null})}>Nuevo tramo</Button>
                )}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={MAINTENANCE_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} rowActions={actions} minWidth={1280}/>
            {editing && <AssetEditorModal asset={editing.asset} names={names} onClose={() => setEditing(null)}/>}
            {orders && <AssetOrdersModal asset={orders} onClose={() => setOrders(null)}/>}
            {history && (
                <RevisionsModal label={assetLabel(history)} path={assetRevisionsPath(history.id)} describe={describeAsset}
                                onClose={() => setHistory(null)}/>
            )}
            {disabling && (
                <ConfirmModal title={`Desactivar ${assetLabel(disabling)}`} confirmLabel="Desactivar" cancelLabel="Volver"
                              loading={acting.isPending} onConfirm={disable} onClose={() => setDisabling(null)}>
                    {disableWarning(disabling)}
                </ConfirmModal>
            )}
        </Stack>
    )
}

/** Uno sincronizado sigue desactivado aunque mto-configuration lo mande activo: es lo que lo diferencia de antes. */
function disableWarning(asset) {
    const survives = isSynchronizedAsset(asset) ? ' Sigue desactivado aunque mto-configuration lo mande activo.' : ''
    return `Deja de admitir trabajo nuevo; las órdenes que tiene no cambian.${survives} Se puede reactivar.`
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Ningún activo coincide con los filtros.' : 'No hay activos.'
}
