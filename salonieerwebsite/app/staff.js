/* Presentation vocabulary. 2.30: one wording for every salon type — Team /
   Specialist (مختص) — with no gendered or category-based titles. Older text
   written with the barber words is mapped to the same terms. */
window.Staff = (() => {
  const vocabulary = {singular:'مختص', definite:'المختص', plural:'المختصون'};
  // The words are the same for every salon, so nothing is fetched.
  async function load() {}
  function word(value) {
    // Grammatical case follows the original word (…ون / …ين).
    if (/^(حلاقين|مختصين)$/.test(value)) return 'مختصين';
    if (/^(الحلاقين|المختصين)$/.test(value)) return 'المختصين';
    if (/^(حلاقون|كوافيرات|مختصون)$/.test(value)) return 'مختصون';
    if (/^(الحلاقون|الكوافيرات|المختصون)$/.test(value)) return vocabulary.plural;
    return /^(الحلاق|الكوافيرة|المختص)$/.test(value) ? vocabulary.definite : vocabulary.singular;
  }
  // "حلاقة" (a haircut) is a service, not a person, and is left alone.
  const copy = text => String(text).replace(/(?:الحلاقون|الحلاقين|حلاقون|حلاقين|الكوافيرات|كوافيرات|الكوافيرة|كوافيرة|الحلاق|حلاق)(?!ة)/g, word);
  const title = () => vocabulary.singular;
  return {load, word, copy, title};
})();
