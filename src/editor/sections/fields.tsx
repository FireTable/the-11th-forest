/**
 * src/editor/sections/fields.tsx
 * --------------------------------------------------------------------------
 * Tiny form primitives shared by every editor section (Character,
 * Monster, Weapon, …). They used to live inside character.tsx — pulled
 * out so modules.tsx, sprite-editor.tsx, etc. can import them without
 * pulling CharacterSection itself.
 */
import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-2 border border-neutral-800 rounded p-2.5 bg-neutral-900/40">
            <div className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wide">
                {title}
            </div>
            <div className="grid grid-cols-2 gap-1.5">{children}</div>
        </div>
    );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-400">{label}</span>
            {children}
        </div>
    );
}

export function NumberField({
    label,
    value,
    onChange,
    step = 1,
    min,
    max,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    step?: number;
    min?: number;
    max?: number;
}) {
    return (
        <Field label={label}>
            <input
                type="number"
                step={step}
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-7 text-xs bg-neutral-950 border border-neutral-700 rounded px-2 font-mono"
            />
        </Field>
    );
}