import type { InAppNotification } from '@event-sharing/contracts';
import type { ToastTone } from '@/contexts/ToastContext';

type Presentation = { label: string; tone: ToastTone; badge: string };

const info = 'border-blue-200 bg-blue-50 text-blue-900';
const success = 'border-green-200 bg-green-50 text-green-900';
const warning = 'border-amber-200 bg-amber-50 text-amber-900';
const error = 'border-red-200 bg-red-50 text-red-900';
const action = 'border-neutral-700 bg-neutral-900 text-white';

export const notificationPresentation: Record<
  InAppNotification['type'],
  Presentation
> = {
  EVENT_MODERATION: {
    label: 'Moderation',
    tone: 'action_required',
    badge: action,
  },
  EVENT_APPROVED: { label: 'Event approved', tone: 'success', badge: success },
  EVENT_REJECTED: { label: 'Event declined', tone: 'error', badge: error },
  EVENT_UPDATED: { label: 'Event updated', tone: 'info', badge: info },
  EVENT_CANCELLED: {
    label: 'Event cancelled',
    tone: 'warning',
    badge: warning,
  },
  EVENT_COMPLETED: { label: 'Event completed', tone: 'info', badge: info },
  EVENT_ORGANIZER_DELETED: {
    label: 'Organizer left',
    tone: 'info',
    badge: info,
  },
  PARTICIPANT_JOINED: {
    label: 'Participant joined',
    tone: 'info',
    badge: info,
  },
  DIRECT_MESSAGE: { label: 'Direct message', tone: 'info', badge: info },
  EVENT_MESSAGE: { label: 'Event announcement', tone: 'info', badge: info },
  FRIEND_REQUEST: {
    label: 'Friend request',
    tone: 'action_required',
    badge: action,
  },
  FRIEND_ACCEPTED: {
    label: 'Friend accepted',
    tone: 'success',
    badge: success,
  },
  EVENT_INVITATION: {
    label: 'Event invitation',
    tone: 'action_required',
    badge: action,
  },
  CHAT_GROUP_CHANGED: { label: 'Chat group', tone: 'info', badge: info },
  ORGANIZER_REQUEST: {
    label: 'Organizer request',
    tone: 'action_required',
    badge: action,
  },
  ORGANIZER_REQUEST_DECISION: {
    label: 'Organizer decision',
    tone: 'info',
    badge: info,
  },
};
