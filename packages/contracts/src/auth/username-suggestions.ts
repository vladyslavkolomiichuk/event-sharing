import { ChosenUsernameSchema } from './user-identity.schema.js';

const cyrillic: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e',
  є: 'ye', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', ы: 'y',
  э: 'e', ё: 'yo', ъ: '',
};

export function usernameCandidates(name: string): string[] {
  const latin = [...name.toLowerCase()]
    .map((letter) => cyrillic[letter] ?? letter)
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
  const parts = latin.split(/[^a-z0-9]+/).filter(Boolean);
  if (!parts.length) return [];

  const first = parts[0]!.slice(0, 14);
  const last = parts.at(-1)!.slice(0, 14);
  const bases = parts.length > 1
    ? [`${first}_${last}`, `${first}${last}`]
    : [`${first}_`, first];
  const candidates: string[] = [];
  for (let number = 0; number <= 20; number++) {
    for (const base of bases) {
      const suffix = number === 0 && parts.length > 1 ? '' : String(number + 1);
      const value = `${base.slice(0, 30 - suffix.length)}${suffix}`;
      if (ChosenUsernameSchema.safeParse(value).success) {
        candidates.push(value);
      }
    }
  }
  return [...new Set(candidates)];
}
