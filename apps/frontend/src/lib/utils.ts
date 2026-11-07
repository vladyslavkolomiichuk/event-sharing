import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
