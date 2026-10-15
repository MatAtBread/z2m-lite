// Glow IHD payload hygiene.
//
// The meter publishes two kinds of frame: a reading, and - when it has no fresh reading to
// report - a placeholder in which every numeric field is null and its own timestamp is the
// Unix epoch. A placeholder is not data, and storing it is doubly harmful: it replaces the
// last good value in the stored-topics cache, so /data/latest and /data/stored_topics begin
// reporting nulls for the meter, and it lands a null row in the history, where the chart's
// per-interval avg() counts that null as zero and dents the line.
//
// The test is deliberately ONE thing: the epoch timestamp. An epoch stamp cannot be a real
// reading, so this is a validity check on the frame rather than a plausibility judgement
// about the reading, and it cannot reject good data. (A frame carrying a real timestamp but
// a null cumulative would slip through; that combination has not been observed.)
//
// Kept out of the MQTT bridge so the rule is testable on its own, and out of the database
// writer because that module knows only about SQL - deciding what is worth keeping belongs
// at receipt, alongside the existing blockedTopics list.
const glowSensorTopic = /^glow\/[^/]+\/SENSOR\/(gasmeter|electricitymeter)$/;

export function isGlowPlaceholder(topic: string, payload: unknown): boolean {
  const match = glowSensorTopic.exec(topic);
  if (!match || !payload || typeof payload !== 'object')
    return false;
  const meter = (payload as any)[match[1]];
  if (!meter || typeof meter !== 'object')
    return false;
  const stamp = meter.timestamp;
  return typeof stamp === 'string' && stamp.startsWith('1970-01-01T00:00:00');
}
