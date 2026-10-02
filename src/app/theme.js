import {createTheme, Modal} from '@mantine/core'

/** El tema de Mantine y los textos por defecto en castellano. Cada fase anade aqui los de sus componentes. */
export const theme = createTheme({
    primaryColor: 'blue',
    defaultRadius: 'sm',
    components: {
        Modal: Modal.extend({defaultProps: {closeButtonProps: {'aria-label': 'Cerrar'}}}),
    },
})

/** Las fechas de @mantine/dates en castellano y con la semana empezando en lunes. */
export const DATES_SETTINGS = Object.freeze({locale: 'es', firstDayOfWeek: 1, weekendDays: [0, 6]})
