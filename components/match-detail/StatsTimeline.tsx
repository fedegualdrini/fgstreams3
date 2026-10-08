import type { FlashscoreEvent } from '@/types/api';

const EVENT_ICONS: Record<FlashscoreEvent['type'], string> = {
  goal: '⚽',
  yellow_card: '🟨',
  red_card: '🟥',
  substitution: '↕',
  other: '•',
};

/** Events listed down a center divider: home on the left, away on the right. */
export default function StatsTimeline({ events }: { events: FlashscoreEvent[] }) {
  return (
    <div className="stats-timeline">
      <div className="stats-timeline__line" />
      {events.map((event, i) => (
        <EventRow key={i} event={event} />
      ))}
    </div>
  );
}

function EventRow({ event }: { event: FlashscoreEvent }) {
  // The modifier (home | away | unknown) picks the side; unknown-team events
  // such as kick-off or a penalty shootout span the full width.
  return (
    <div className={`stats-event stats-event--${event.team}`}>
      <span className="stats-event__minute">{event.minute}</span>
      <span className="stats-event__icon">{EVENT_ICONS[event.type]}</span>
      <span className="stats-event__player">{event.player || event.type.replace('_', ' ')}</span>
    </div>
  );
}
