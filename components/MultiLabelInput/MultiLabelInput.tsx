'use client'

import LabelInput from '@/components/LabelInput'
import styles from './MultiLabelInput.module.css'

interface MultiLabelInputProps {
    /** ラベルの配列。空行も保持し、保存時に呼び出し側でtrim/空除去する */
    values: string[]
    onChange: (values: string[]) => void
    placeholder?: string
    /** 各入力欄に適用するクラス（ページ既存の .input を流用） */
    inputClassName?: string
    /** この文字列を含む候補を先頭に並べる（LabelInputへ委譲） */
    prioritySubstring?: string
    /** 未発火ラベルの生成候補サフィックス（LabelInputへ委譲） */
    synthesizeSuffix?: string
    'aria-label'?: string
}

/**
 * GTMラベルを1行=1ラベルで入力するコンポーネント。
 * カンマ区切りで1フィールドに詰め込む方式が入力しづらいため、行の追加/削除で複数指定する。
 * 各行は LabelInput（実ラベルのオートコンプリート付き）。
 */
export default function MultiLabelInput({
    values,
    onChange,
    placeholder,
    inputClassName,
    prioritySubstring,
    synthesizeSuffix,
    'aria-label': ariaLabel,
}: MultiLabelInputProps) {
    const rows = values.length > 0 ? values : ['']

    const update = (i: number, v: string) => {
        const next = [...rows]
        next[i] = v
        onChange(next)
    }

    return (
        <div className={styles.wrapper}>
            {rows.map((v, i) => (
                <div key={i} className={styles.row}>
                    <div className={styles.inputWrap}>
                        <LabelInput
                            value={v}
                            onChange={(val) => update(i, val)}
                            placeholder={placeholder}
                            className={inputClassName}
                            prioritySubstring={prioritySubstring}
                            synthesizeSuffix={synthesizeSuffix}
                        />
                    </div>
                    {rows.length > 1 && (
                        <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                            aria-label={`${ariaLabel ?? 'ラベル'} ${i + 1}行目を削除`}
                        >
                            −
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                className={styles.addBtn}
                onClick={() => onChange([...rows, ''])}
                aria-label={`${ariaLabel ?? 'ラベル'}を追加`}
            >
                ＋ ラベルを追加
            </button>
        </div>
    )
}
