import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {IconArrowLeft, IconArrowUp, IconBan, IconCircleCheck, IconHistory, IconPencil, IconPlus, IconRefresh, IconUsers} from '@tabler/icons-react'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {UNIT_KIND, WORK_DISCIPLINE} from '../../api/resources/enums.js'
import {isActiveUnit, isTeam, unitRevisionsPath} from '../../api/resources/units.js'
import {personLabel, unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import LazyTabs from '../../ui/LazyTabs.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import {useConfigurationNames} from '../maintenance/useMaintenanceNames.js'
import ChildUnitsPanel from './ChildUnitsPanel.jsx'
import {ORGANIZATION_PATH, PEOPLE_PATH, unitPath} from './resourcesRoutes.js'
import {describeUnit, headText, linemenText, unitState} from './resourcesTexts.js'
import TeamMembersModal from './TeamMembersModal.jsx'
import TeamMembersPanel from './TeamMembersPanel.jsx'
import UnitEditorModal from './UnitEditorModal.jsx'
import {useUnit, useUnitAction, useUnitTree} from './useResources.js'

/** recursos/organigrama/:unitId: la ficha de una unidad (el port de UnitDetailView), con key por id. */
export default function UnitDetailPage() {
    const {unitId} = useParams()
    return <UnitDetail key={unitId} unitId={unitId}/>
}

/**
 * La cabecera de una unidad: de quién depende, quién la dirige y sus EP; en un equipo, además, sus
 * linemen frente a la regla de 2 a 6, su supervisor y su jefe de supervisores. Modificar y reactivar
 * piden resources-write; desactivar, resources-delete. Un equipo vuelve completo: reactivarlo pide sus
 * linemen. La pestaña «Linemen» de un equipo y «Unidades» de las demás piden sus datos al abrirse.
 */
function UnitDetail({unitId}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)
    const navigate = useNavigate()
    const names = useConfigurationNames()
    const unit = useUnit(unitId)
    // El diálogo abierto: 'edit', 'create', 'deactivate', 'reactivate' o 'history'.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)
    // El árbol solo hace falta para elegir padre, al modificar o al dar de alta debajo.
    const tree = useUnitTree(false, {enabled: dialog === 'edit' || dialog === 'create'})
    const acting = useUnitAction()

    if (unit.error instanceof NotFoundError) {
        return <Navigate to={ORGANIZATION_PATH} replace/>
    }
    if (unit.isError && !unit.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer la unidad: {errorMessage(unit.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(ORGANIZATION_PATH)}>
                        Volver al organigrama
                    </Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={unit.isFetching} onClick={() => void unit.refetch()}>Reintentar</Button>
                </Group>
            </Stack>
        )
    }
    if (!unit.data) {
        return <Center py="xl"><Loader aria-label="Cargando la unidad"/></Center>
    }

    const current = unit.data
    const team = isTeam(current)
    const active = isActiveUnit(current)
    const packages = [...(current.executionPackageIds ?? [])].sort((a, b) => a - b)

    const deactivate = () => acting.mutate({action: 'deactivate', unit: current}, {
        onSuccess: () => notifySuccess(`Desactivada ${unitLabel(current)}`),
        onSettled: close,
    })
    const reactivate = () => {
        if (team) {
            setDialog('reactivate')
            return
        }
        acting.mutate({action: 'reactivate', unit: current}, {onSuccess: () => notifySuccess(`Reactivada ${unitLabel(current)}`)})
    }

    const tabs = team
        ? [{value: 'members', label: 'Linemen', render: () => <TeamMembersPanel team={current} canWrite={canWrite && active}/>}]
        : [{value: 'children', label: 'Unidades', render: () => <ChildUnitsPanel unit={current} names={names}/>}]

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{unitLabel(current)}</Title>
                <Badge variant="light">{UNIT_KIND.label(current.kind)}</Badge>
                <Badge aria-label="Estado de la unidad" variant="light" color={active ? 'green' : 'gray'}>{unitState(current)}</Badge>
            </Group>
            <Stack gap={2} aria-label="Resumen de la unidad">
                <Text size="sm">
                    {[current.discipline ? `Disciplina: ${WORK_DISCIPLINE.label(current.discipline)}` : null,
                        `Depende de: ${current.parent ? unitLabel(current.parent) : 'nada (raíz)'}`, `Jefe: ${headText(current.head)}`,
                        `EP: ${packages.length > 0 ? packages.map(names.packageName).join(', ') : '-'}`].filter(Boolean).join(' · ')}
                </Text>
                {team && (
                    <Text size="sm">
                        {[`Linemen: ${linemenText(current)}`, `Completo: ${current.complete ? 'Sí' : 'No'}`,
                            `Supervisor: ${current.supervisor ? personLabel(current.supervisor) : '-'}`,
                            `Jefe de supervisores: ${current.chiefSupervisor ? personLabel(current.chiefSupervisor) : '-'}`,
                            `Vehículo: ${current.defaultVehicle ? unitLabel(current.defaultVehicle) : '-'}`].join(' · ')}
                    </Text>
                )}
            </Stack>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(ORGANIZATION_PATH)}>
                    Volver al organigrama
                </Button>
                {current.parent && (
                    <Button variant="default" leftSection={<IconArrowUp size={16}/>} onClick={() => navigate(unitPath(current.parent.id))}>
                        {`Ir a ${current.parent.code}`}
                    </Button>
                )}
                <Button variant="default" leftSection={<IconUsers size={16}/>}
                        onClick={() => navigate(`${PEOPLE_PATH}?unitId=${encodeURIComponent(current.id)}`)}>Ver su personal</Button>
                <Button variant="default" leftSection={<IconHistory size={16}/>} onClick={() => setDialog('history')}>Historial</Button>
                {canWrite && active && <Button leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>}
                {canWrite && active && !team && UNIT_KIND.isKnown(current.kind) && (
                    <Button variant="default" leftSection={<IconPlus size={16}/>} onClick={() => setDialog('create')}>Nueva unidad debajo</Button>
                )}
                {canDelete && active && (
                    <Button color="red" variant="light" leftSection={<IconBan size={16}/>} onClick={() => setDialog('deactivate')}>Desactivar</Button>
                )}
                {canWrite && !active && (
                    <Button leftSection={<IconCircleCheck size={16}/>} loading={acting.isPending} onClick={reactivate}>Reactivar</Button>
                )}
            </Group>
            <LazyTabs tabs={tabs}/>
            {dialog === 'edit' && tree.data && <UnitEditorModal unit={current} tree={tree.data} onClose={close}/>}
            {dialog === 'create' && tree.data && (
                <UnitEditorModal unit={null} parent={current} tree={tree.data} onClose={close}
                                 onSaved={(created) => created && navigate(unitPath(created.id))}/>
            )}
            {dialog === 'reactivate' && <TeamMembersModal team={current} reactivating current={[]} onClose={close}/>}
            {dialog === 'history' && (
                <RevisionsModal label={current.code} path={unitRevisionsPath(current.id)} describe={describeUnit} onClose={close}/>
            )}
            {dialog === 'deactivate' && (
                <ConfirmModal title={`Desactivar ${unitLabel(current)}`} confirmLabel="Desactivar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={deactivate} onClose={close}>
                    {team
                        ? 'No se borra: sus linemen salen de él hoy y queda fuera de los turnos nuevos. Para reactivarlo hará falta darle linemen otra vez.'
                        : 'No se borra. Si tiene unidades activas debajo, el servicio no lo deja: desactívalas o muévelas antes.'}
                </ConfirmModal>
            )}
        </Stack>
    )
}
