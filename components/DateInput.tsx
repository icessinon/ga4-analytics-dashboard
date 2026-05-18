'use client'

import { useRef } from 'react'

interface DateInputProps {
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    className?: string
    required?: boolean
    min?: string
    max?: string
}

export default function DateInput({ value, onChange, className, required, min, max }: DateInputProps) {
    const ref = useRef<HTMLInputElement>(null)

    const handleClick = () => {
        try {
            ref.current?.showPicker()
        } catch {}
    }

    return (
        <input
            ref={ref}
            type="date"
            value={value}
            onChange={onChange}
            onClick={handleClick}
            className={className}
            required={required}
            min={min}
            max={max}
        />
    )
}
