/**
 * ComicVine integration test script
 * Run: COMICVINE_API_KEY=<key> npx tsx scripts/test-comicvine.ts
 *
 * Tests all flows and logs raw results for analysis.
 */

import {
  searchComicVine,
  findVolume,
  findCharacter,
  findPerson,
  getRecentIssues,
  searchPublisher,
  getPublisherVolumes,
  enrichFromComicVine,
  cvRoleToCreatorRole,
  type CVSearchResult,
  type CVVolume,
  type CVCharacter,
} from '../lib/integrations/comicvine'

// ── Helpers ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const findings: string[] = []

function log(label: string, data: unknown) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`▸ ${label}`)
  console.log(JSON.stringify(data, null, 2))
}

async function run(label: string, fn: () => Promise<void>) {
  const start = Date.now()
  try {
    await fn()
    const ms = Date.now() - start
    console.log(`\n✓ ${label} (${ms}ms)`)
    passed++
  } catch (err) {
    const ms = Date.now() - start
    console.error(`\n✗ ${label} (${ms}ms)`)
    console.error('  ERROR:', err instanceof Error ? err.message : String(err))
    failed++
  }
}

function note(msg: string) {
  findings.push(msg)
  console.log(`  📌 ${msg}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────

async function main() {

await run('1. searchComicVine — volume: "Black Panther" (Marvel)', async () => {
  const results = await searchComicVine('Black Panther Marvel', ['volume'], 5)
  log('results', results.map(r => ({
    id: r.id, name: r.name, resource_type: r.resource_type,
    publisher: r.publisher?.name, start_year: r.start_year,
    hasImage: !!r.image?.original_url, deck: r.deck?.slice(0, 80),
  })))
  if (!results.length) { note('WARN: zero results for Black Panther volume'); return }
  const exact = results.find(r => r.name?.toLowerCase() === 'black panther')
  if (!exact) note('WARN: no exact name match — fuzzy fallback will be used')
  else note('OK: exact name match found')
  if (!results[0].image?.original_url) note('WARN: first result has no image URL')
})

await run('2. searchComicVine — character: "Storm"', async () => {
  const results = await searchComicVine('Storm', ['character'], 3)
  log('results', results.map(r => ({
    id: r.id, name: r.name, real_name: r.real_name,
    publisher: r.publisher?.name, hasImage: !!r.image?.original_url,
  })))
  const storm = results.find(r => r.name?.toLowerCase() === 'storm')
  if (!storm) note('WARN: Storm not found by exact name')
  else {
    if (!storm.real_name) note('WARN: Storm search result missing real_name (only in detail endpoint)')
    else note(`OK: real_name in search = "${storm.real_name}"`)
  }
})

await run('3. searchComicVine — person: "Denys Cowan"', async () => {
  const results = await searchComicVine('Denys Cowan', ['person'], 3)
  log('results', results.map(r => ({
    id: r.id, name: r.name, resource_type: r.resource_type,
    hasImage: !!r.image?.original_url,
  })))
  if (!results.length) note('WARN: Denys Cowan not found')
  else note(`OK: found "${results[0].name}" id=${results[0].id}`)
})

await run('4. searchComicVine — publisher: "Marvel"', async () => {
  const results = await searchComicVine('Marvel', ['publisher'], 3)
  log('results', results.map(r => ({ id: r.id, name: r.name, resource_type: r.resource_type })))
  const marvel = results.find(r => r.name?.toLowerCase().includes('marvel'))
  if (!marvel) note('WARN: Marvel publisher not found in search')
  else note(`OK: Marvel publisher id=${marvel.id}`)
})

await run('5. findVolume — "Black Panther" + "Marvel"', async () => {
  const vol = await findVolume('Black Panther', 'Marvel')
  if (!vol) { note('WARN: findVolume returned null'); return }
  log('volume', {
    id: vol.id, name: vol.name, publisher: vol.publisher?.name,
    start_year: vol.start_year, count_of_issues: vol.count_of_issues,
    hasImage: !!vol.image?.original_url,
    imageUrl: vol.image?.original_url,
    personCreditsCount: vol.person_credits?.length ?? 0,
    person_credits: vol.person_credits?.slice(0, 5),
    characterCreditsCount: vol.character_credits?.length ?? 0,
  })
  if (!vol.person_credits?.length) note('WARN: no person_credits on volume')
  else {
    const roles = Array.from(new Set(vol.person_credits.map(p => p.role)))
    note(`OK: person_credits found — ${vol.person_credits.length} people, roles: ${roles.join(', ')}`)
    const mapped = vol.person_credits.slice(0, 5).map(p => ({
      name: p.name, cvRole: p.role, mapped: cvRoleToCreatorRole(p.role),
    }))
    log('role mapping sample', mapped)
  }
  if (!vol.image?.original_url) note('WARN: no image on volume')
})

await run('6. findVolume — "Hardware: Season One" (Milestone/DC)', async () => {
  const vol = await findVolume('Hardware', 'DC')
  if (!vol) { note('WARN: Hardware volume not found'); return }
  log('volume', {
    id: vol.id, name: vol.name, publisher: vol.publisher?.name,
    start_year: vol.start_year, person_credits: vol.person_credits?.slice(0, 6),
    imageUrl: vol.image?.original_url,
  })
  if (vol.person_credits?.length) note(`OK: Hardware has ${vol.person_credits.length} creator credits`)
  else note('WARN: Hardware has no person_credits')
})

await run('7. findCharacter — "Storm" (detail endpoint)', async () => {
  const char = await findCharacter('Storm')
  if (!char) { note('WARN: findCharacter returned null for Storm'); return }
  log('character', {
    id: char.id, name: char.name, real_name: char.real_name,
    publisher: char.publisher?.name, gender: char.gender,
    count_of_issue_appearances: char.count_of_issue_appearances,
    powersCount: char.powers?.length ?? 0, powers: char.powers?.slice(0, 6),
    first_appeared_in_issue: char.first_appeared_in_issue,
    imageUrl: char.image?.original_url,
    deck: char.deck,
  })
  if (!char.real_name) note('WARN: Storm missing real_name in detail')
  else note(`OK: real_name = "${char.real_name}"`)
  if (!char.powers?.length) note('WARN: no powers on Storm')
  else note(`OK: ${char.powers.length} powers found`)
  if (!char.first_appeared_in_issue) note('WARN: missing first_appeared_in_issue')
  else note(`OK: first appearance = ${JSON.stringify(char.first_appeared_in_issue)}`)
})

await run('8. findCharacter — "Miles Morales"', async () => {
  const char = await findCharacter('Miles Morales')
  if (!char) { note('WARN: Miles Morales not found'); return }
  log('character', {
    id: char.id, name: char.name, real_name: char.real_name,
    publisher: char.publisher?.name,
    first_appeared_in_issue: char.first_appeared_in_issue,
    creatorsCount: char.creators?.length ?? 0,
    creators: char.creators?.slice(0, 5),
    imageUrl: char.image?.original_url,
  })
  if (!char.creators?.length) note('WARN: Miles Morales missing creators field')
  else note(`OK: creators = ${char.creators.map(c => c.name).join(', ')}`)
})

await run('9. findPerson — "Ta-Nehisi Coates"', async () => {
  const person = await findPerson('Ta-Nehisi Coates')
  if (!person) { note('WARN: Ta-Nehisi Coates not found'); return }
  log('person', {
    id: person.id, name: person.name, country: person.country,
    birth: person.birth, deck: person.deck?.slice(0, 120),
    createdCharactersCount: person.created_characters?.length ?? 0,
    created_characters: person.created_characters?.slice(0, 8),
    imageUrl: person.image?.original_url,
  })
  if (!person.country) note('WARN: country missing for Ta-Nehisi Coates')
  else note(`OK: country = "${person.country}"`)
  if (!person.created_characters?.length) note('WARN: no created_characters for Ta-Nehisi Coates')
  else note(`OK: ${person.created_characters.length} characters linked`)
})

await run('10. enrichFromComicVine — comic: "Black Panther #1 (2016)"', async () => {
  const result = await enrichFromComicVine('Black Panther #1 (2016)', 'Marvel', 'comic')
  log('enrichment result', result)
  if (!result) { note('WARN: enrichment returned null'); return }
  note(`OK: cvId=${result.cvId}, resourceType=${result.resourceType}`)
  if (!result.coverImageUrl) note('WARN: no coverImageUrl')
  else note(`OK: coverImageUrl = ${result.coverImageUrl}`)
  if (!result.creators?.length) note('WARN: no creators after enrichment')
  else note(`OK: ${result.creators.length} creators: ${result.creators.map(c => `${c.name}(${c.role})`).join(', ')}`)
})

await run('11. enrichFromComicVine — personaje: "Storm"', async () => {
  const result = await enrichFromComicVine('Storm', undefined, 'personaje')
  log('enrichment result', result)
  if (!result) { note('WARN: enrichment returned null for Storm'); return }
  note(`OK: resourceType=${result.resourceType}, realName=${result.realName}`)
  if (!result.powers?.length) note('WARN: no powers in enrichment')
  else note(`OK: ${result.powers.length} powers`)
  if (!result.firstAppearance) note('WARN: no firstAppearance string')
  else note(`OK: firstAppearance = "${result.firstAppearance}"`)
})

await run('12. enrichFromComicVine — autor: "Denys Cowan"', async () => {
  const result = await enrichFromComicVine('Denys Cowan', undefined, 'autor')
  log('enrichment result', result)
  if (!result) { note('WARN: enrichment returned null for Denys Cowan'); return }
  note(`OK: resourceType=${result.resourceType}, country=${result.country}`)
  if (!result.createdCharacters?.length) note('WARN: no createdCharacters')
  else note(`OK: createdCharacters = ${result.createdCharacters.slice(0,5).map(c=>c.name).join(', ')}`)
})

await run('13. getRecentIssues — January 2024 (all publishers, CV limitation)', async () => {
  const issues = await getRecentIssues('2024-01-01', '2024-01-31', 10)
  log('issues (first 5)', issues.slice(0, 5).map(i => ({
    id: i.id, name: i.name, issue_number: i.issue_number,
    cover_date: i.cover_date, volume: i.volume?.name,
    hasImage: !!i.image?.original_url,
    personCreditsCount: i.person_credits?.length ?? 0,
  })))
  note(`OK: ${issues.length} issues returned for Jan 2024`)
  const withImage = issues.filter(i => !!i.image?.original_url).length
  note(`Images: ${withImage}/${issues.length} have image URLs`)
  const withCreators = issues.filter(i => i.person_credits?.length).length
  note(`Creators: ${withCreators}/${issues.length} have person_credits (CV list endpoints rarely include this)`)
})

await run('14. getPublisherVolumes (search-based) — Marvel', async () => {
  const volumes = await getPublisherVolumes('Marvel Comics', 10)
  log('search volumes (first 5)', volumes.slice(0, 5).map(v => ({
    id: v.id, name: v.name, start_year: v.start_year,
    publisher: v.publisher?.name,
    count_of_issues: v.count_of_issues, hasImage: !!v.image?.original_url,
  })))
  note(`OK: ${volumes.length} volumes returned for Marvel search`)
  const withImage = volumes.filter(v => !!v.image?.original_url).length
  note(`Images: ${withImage}/${volumes.length} volumes have images`)
  const marvelVolumes = volumes.filter(v => v.publisher?.name?.toLowerCase().includes('marvel'))
  note(`Publisher match: ${marvelVolumes.length}/${volumes.length} have Marvel as publisher`)
})

await run('15. searchPublisher — "Image Comics"', async () => {
  const pub = await searchPublisher('Image Comics')
  if (!pub) { note('WARN: Image Comics not found'); return }
  note(`OK: Image Comics id=${pub.id} (expected 6), name="${pub.name}"`)
  if (pub.id !== 6) note(`WARN: got id=${pub.id}, expected 6`)
})

await run('16. Edge case — no results query', async () => {
  const results = await searchComicVine('xqzwkjfnvbqzxcvbnm', ['volume'], 3)
  if (results.length > 0) note('WARN: expected 0 results for gibberish query')
  else note('OK: returns empty array for no-match queries')
})

await run('17. cvRoleToCreatorRole mapping', async () => {
  const cases = [
    ['writer', 'writer'], ['penciller', 'artist'], ['inker', 'artist'],
    ['colorist', 'colorist'], ['cover', 'cover_artist'], ['cover artist', 'cover_artist'],
    ['editor', 'other'], ['letterer', 'other'], ['artist', 'artist'],
  ]
  let allPass = true
  for (const [input, expected] of cases) {
    const result = cvRoleToCreatorRole(input)
    if (result !== expected) {
      note(`FAIL: cvRoleToCreatorRole("${input}") = "${result}", expected "${expected}"`)
      allPass = false
    }
  }
  if (allPass) note('OK: all role mappings correct')
})

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`RESULTS: ${passed} passed, ${failed} failed`)
console.log(`\n📋 FINDINGS:`)
findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
console.log(`${'═'.repeat(60)}\n`)
}

main().catch(console.error)
