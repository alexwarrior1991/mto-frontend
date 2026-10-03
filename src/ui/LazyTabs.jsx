import {Tabs} from '@mantine/core'
import {useState} from 'react'

/**
 * Pestañas que piden sus datos la primera vez que se abren y no vuelven a pedirlos al reelegirlas: el
 * port de LazyPanel del backoffice.
 *
 * Las de Mantine no sirven tal cual. Por defecto montan todas las pestañas a la vez
 * (keepMounted con Activity), así que todas pedirían sus datos al abrir la pantalla; en el navegador,
 * además, Activity desmonta los efectos de las ocultas, y reelegir una volvía a pedirlos.
 *
 * Aquí una pestaña se monta la primera vez que se abre y se queda montada, oculta con display:none.
 * Sus consultas siguen vivas y reelegirla no pide nada. Releer una consulta solo pide lo de las
 * pestañas que ya se abrieron, que es el reloadIfLoaded del backoffice.
 *
 * @param {Array<{value: string, label: string, render: Function}>} tabs cada render pinta su panel
 */
export default function LazyTabs({tabs, defaultValue = tabs[0]?.value}) {
    const [active, setActive] = useState(defaultValue)
    const [visited, setVisited] = useState(() => new Set([defaultValue]))

    const select = (value) => {
        if (!value) {
            return
        }
        setActive(value)
        setVisited((current) => (current.has(value) ? current : new Set(current).add(value)))
    }

    return (
        <Tabs value={active} onChange={select} keepMounted keepMountedMode="display-none">
            <Tabs.List>
                {tabs.map((tab) => <Tabs.Tab key={tab.value} value={tab.value}>{tab.label}</Tabs.Tab>)}
            </Tabs.List>
            {tabs.map((tab) => (
                <Tabs.Panel key={tab.value} value={tab.value} pt="md">
                    {visited.has(tab.value) ? tab.render() : null}
                </Tabs.Panel>
            ))}
        </Tabs>
    )
}
