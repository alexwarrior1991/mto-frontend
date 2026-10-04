import {Select, Stack} from '@mantine/core'
import {useState} from 'react'
import {TASK_STATUS} from '../../api/maintenance/enums.js'
import DataTable from '../../ui/DataTable.jsx'
import {kp} from './maintenanceTexts.js'
import {useShiftProfiles} from './useMaintenance.js'

/**
 * Los perfiles de las tareas del turno, en el orden físico de la vía que da el servicio (el port de
 * ShiftProfilesPanel); de entrada, los ya revisados (tarea completada).
 */
export default function ShiftProfilesPanel({shift}) {
    const [status, setStatus] = useState('COMPLETED')
    const profiles = useShiftProfiles(shift.id, status)
    const columns = [
        {key: 'name', label: 'Perfil', render: (profile) => profile.name ?? ''},
        {key: 'code', label: 'Código', render: (profile) => profile.code ?? ''},
        {key: 'kp', label: 'KP', render: (profile) => kp(profile.startKp)},
        {key: 'sectioning', label: 'Seccionamiento', render: (profile) => profile.sectioning ?? ''},
    ]
    return (
        <Stack>
            <Select label="Tareas" placeholder="Todas" clearable w={200} data={TASK_STATUS.selectable()} value={status} onChange={setStatus}/>
            <DataTable ariaLabel={`Perfiles de ${shift.code}`} columns={columns} rows={profiles.data ?? []} loading={profiles.isPending}
                       emptyText={profiles.isError ? 'No se han podido leer los perfiles.' : 'Ningún perfil.'}/>
        </Stack>
    )
}
