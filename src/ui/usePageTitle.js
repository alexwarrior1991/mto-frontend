import {useEffect} from 'react'

/** El titulo de la pestana del navegador: «Pantalla · MTO». */
export function usePageTitle(title) {
    useEffect(() => {
        document.title = title ? `${title} · MTO` : 'MTO'
    }, [title])
}
