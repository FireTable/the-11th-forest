import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind-aware className combinator. Merges Tailwind utilities
 * intelligently (later wins, conflicting classes deduplicated).
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}