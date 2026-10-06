import ui from './ui.module.css'

export { ui }

/** className を条件付きで連結する。falsy は捨てる */
export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ')
}
