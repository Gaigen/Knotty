'use client'

/** Транслитерация RU→LAT для автогенерации ключа проекта на клиенте */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
}

export function suggestKeyFromName(name: string): string {
  const letters = transliterate(name).replace(/[^a-z]/g, '').slice(0, 5)
  if (letters.length >= 2) return letters.toUpperCase()
  return (letters + 'xx').slice(0, 2).toUpperCase()
}
