import {Button, Checkbox, FileInput} from '@mantine/core'
import {IconFileSpreadsheet, IconUpload} from '@tabler/icons-react'
import {useState} from 'react'
import {importLovs, importProfiles, MAX_UPLOAD_BYTES, XLSX_MIME} from '../../api/configuration/jobs.js'
import {importLabel} from './jobTexts.js'
import LauncherCard from './LauncherCard.jsx'
import {useLaunchJob} from './useJobs.js'

const ACCEPT = `.xlsx,${XLSX_MIME}`
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024)

/** Las dos importaciones: el maestro de perfiles (config-import) y el catálogo de LOV (además, lov-manage). */
const IMPORTS = Object.freeze({
    profiles: Object.freeze({
        title: 'Importar el maestro de perfiles',
        hint: 'profile-master.xlsx: paquetes, estaciones, vías, perfiles y ménsulas',
        label: 'Importación del maestro de perfiles',
        fileLabel: 'Fichero del maestro de perfiles',
        call: importProfiles,
    }),
    lovs: Object.freeze({
        title: 'Importar el catálogo de LOV',
        hint: 'lov-master.xlsx: las 17 listas de valores por código',
        label: 'Importación del catálogo de LOV',
        fileLabel: 'Fichero del catálogo de LOV',
        call: importLovs,
    }),
})

/**
 * Subir un workbook y lanzar su importación, de verdad o en simulación (dryRun: no escribe nada, solo
 * el informe). El fichero se comprueba aquí solo en lo evidente, su tamaño, porque pasar de 20 MB es
 * un rechazo seguro de nginx y del servicio; lo demás lo dice el informe. Tras el 202 se vacía el
 * fichero, y quitarlo también.
 */
export default function ImportCard({kind, onLaunched}) {
    const config = IMPORTS[kind]
    const [file, setFile] = useState(null)
    const [dryRun, setDryRun] = useState(false)
    const {launch, launching} = useLaunchJob(onLaunched)
    const tooBig = file !== null && file.size > MAX_UPLOAD_BYTES

    const submit = () => {
        const chosen = file
        launch(importLabel(config.label, chosen.name, dryRun), () => config.call(chosen, {dryRun}), () => setFile(null))
    }

    return (
        <LauncherCard title={config.title} hint={config.hint}>
            <FileInput label="Fichero (.xlsx)" placeholder="Elige el fichero" accept={ACCEPT} clearable
                       leftSection={<IconFileSpreadsheet size={16}/>} value={file} onChange={setFile}
                       error={tooBig ? `Pasa de ${MAX_UPLOAD_MB} MB, lo más que admite el servicio.` : null}
                       clearButtonProps={{'aria-label': 'Quitar el fichero'}}
                       fileInputProps={{'aria-label': config.fileLabel}}/>
            <Checkbox label="Simulación: no escribe nada, solo el informe" checked={dryRun}
                      onChange={(event) => setDryRun(event.currentTarget.checked)}/>
            <Button leftSection={<IconUpload size={16}/>} disabled={file === null || tooBig} loading={launching} onClick={submit}>
                Importar
            </Button>
        </LauncherCard>
    )
}
