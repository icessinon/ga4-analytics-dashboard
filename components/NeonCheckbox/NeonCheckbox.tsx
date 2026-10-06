'use client'

import type { NeonCheckboxProps } from './types'
// グローバル CSS のまま。装飾アニメーション用に BEM 名の複合セレクタが約 40 本あり、
// Module 化の書き換えリスクに見合わない。クラス名は neon-checkbox* で他と衝突しない
import './NeonCheckbox.css'

export default function NeonCheckbox({
    checked,
    onChange,
    id,
    children,
    className = '',
}: NeonCheckboxProps) {
    return (
        <label className={`neon-checkbox ${className}`.trim()}>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                id={id}
            />
            <div className="neon-checkbox__frame">
                <div className="neon-checkbox__box">
                    <div className="neon-checkbox__check-container">
                        <svg viewBox="0 0 24 24" className="neon-checkbox__check">
                            <path d="M3,12.5l7,7L21,5" />
                        </svg>
                    </div>
                    <div className="neon-checkbox__glow" />
                    <div className="neon-checkbox__borders">
                        <span /><span /><span /><span />
                    </div>
                </div>
                <div className="neon-checkbox__effects">
                    <div className="neon-checkbox__particles">
                        <span /><span /><span /><span />
                        <span /><span /><span /><span />
                        <span /><span /><span /><span />
                    </div>
                    <div className="neon-checkbox__rings">
                        <div className="ring" />
                        <div className="ring" />
                        <div className="ring" />
                    </div>
                    <div className="neon-checkbox__sparks">
                        <span /><span /><span /><span />
                    </div>
                </div>
            </div>
            {children}
        </label>
    )
}
