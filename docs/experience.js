// Read legacy combined biographies without rewriting the artist's entries.
export function splitExperience(value = '') {
  const result = {exhibitions: [], awards: []};
  let section = 'exhibitions';
  for (const line of String(value).split(/\r?\n/)) {
    const heading = line.trim().replace(/[：:]$/, '');
    if (/^(展覽|展覽經驗|展覽經歷|exhibitions?|exhibition history)$/i.test(heading)) { section = 'exhibitions'; continue; }
    if (/^(得獎|得獎紀錄|獲獎|獲獎紀錄|獲獎經歷|awards?|honou?rs?(?: and awards)?)$/i.test(heading)) { section = 'awards'; continue; }
    result[section].push(line);
  }
  return Object.fromEntries(Object.entries(result).map(([key, lines]) => [key, lines.join('\n').trim()]));
}
export function experienceSettings(settings) {
  const result = {...settings};
  for (const suffix of ['', '_en']) {
    const legacy = splitExperience(settings['experiences' + suffix]);
    for (const key of ['exhibitions', 'awards']) {
      if (!Object.hasOwn(result, key + suffix)) result[key + suffix] = legacy[key];
    }
  }
  return result;
}
