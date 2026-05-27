export interface ViewLabelRow {
    viewLabel: string
    count: number
}

export interface ViewLabelsByDevice {
    mobile: ViewLabelRow[]
    desktop: ViewLabelRow[]
    tablet: ViewLabelRow[]
}
