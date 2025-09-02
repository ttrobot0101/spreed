/**
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ComputedRef, MaybeRef, Ref } from 'vue'
import type { ChatMessage, Conversation } from '../types/index.ts'

import { t } from '@nextcloud/l10n'
import { computed, toRef } from 'vue'
import { useStore } from 'vuex'
import { ATTENDEE, CONVERSATION, MESSAGE } from '../constants.ts'
import { hasTalkFeature } from '../services/CapabilitiesManager.ts'
import { useActorStore } from '../stores/actor.ts'
import { useGuestNameStore } from '../stores/guestName.js'
import { ONE_DAY_IN_MS, ONE_HOUR_IN_MS } from '../utils/formattedTime.ts'
import { getDisplayNameWithFallback } from '../utils/getDisplayName.ts'
import { useConversationInfo } from './useConversationInfo.ts'

/**
 * Check whether ref's value is not undefined
 *
 * @param item
 */
function isDefinedRef<T>(item: Ref<T | undefined>): item is Ref<T> {
	return item.value !== undefined
}

type UseMessageInfoReturnType = {
	isEditable: ComputedRef<boolean>
	isDeleteable: ComputedRef<boolean>
	isCurrentUserOwnMessage: ComputedRef<boolean>
	isBotInOneToOne: ComputedRef<boolean>
	isObjectShare: ComputedRef<boolean>
	isConversationModifiable: ComputedRef<boolean>
	isConversationReadOnly: ComputedRef<boolean>
	isFileShareWithoutCaption: ComputedRef<boolean>
	isFileShare: ComputedRef<boolean>
	hideDownloadOption: ComputedRef<boolean>
	remoteServer: ComputedRef<string>
	lastEditor: ComputedRef<string>
	actorDisplayName: ComputedRef<string>
	actorDisplayNameWithFallback: ComputedRef<string>
}

/**
 * Check whether the user can edit the message or not
 *
 * @param item message object or ref
 */
export function useMessageInfo(item: MaybeRef<ChatMessage | undefined> = undefined): UseMessageInfoReturnType {
	const message = toRef(item)
	// Get the conversation
	const store = useStore()
	const actorStore = useActorStore()
	const conversation = computed<Conversation | undefined>(() => store.getters.conversation(message.value?.token))
	const currentActorId = actorStore.actorId
	const currentActorType = actorStore.actorType
	// If the conversation or message is not available, return false
	if (!isDefinedRef(conversation) || !isDefinedRef(message)) {
		return {
			isEditable: computed(() => false),
			isDeleteable: computed(() => false),
			isCurrentUserOwnMessage: computed(() => false),
			isBotInOneToOne: computed(() => false),
			isObjectShare: computed(() => false),
			isConversationModifiable: computed(() => false),
			isConversationReadOnly: computed(() => false),
			isFileShareWithoutCaption: computed(() => false),
			isFileShare: computed(() => false),
			hideDownloadOption: computed(() => true),
			remoteServer: computed(() => ''),
			lastEditor: computed(() => ''),
			actorDisplayName: computed(() => ''),
			actorDisplayNameWithFallback: computed(() => ''),
		}
	}

	const {
		isOneToOneConversation,
		isConversationReadOnly,
		isConversationModifiable,
	} = useConversationInfo({ item: conversation })

	const isObjectShare = computed(() => Object.keys(Object(message.value.messageParameters)).some((key) => key.startsWith('object')))

	const isCurrentUserOwnMessage = computed(() => message.value.actorId === currentActorId
		&& message.value.actorType === currentActorType)
	const isBotInOneToOne = computed(() => message.value.actorId.startsWith(ATTENDEE.BOT_PREFIX)
		&& message.value.actorType === ATTENDEE.ACTOR_TYPE.BOTS
		&& (conversation.value.type === CONVERSATION.TYPE.ONE_TO_ONE
			|| conversation.value.type === CONVERSATION.TYPE.ONE_TO_ONE_FORMER))

	const isEditable = computed(() => {
		if (!hasTalkFeature(message.value.token, 'edit-messages') || !isConversationModifiable.value || isObjectShare.value || message.value.systemMessage
			|| ((!store.getters.isModerator || isOneToOneConversation.value) && !(isCurrentUserOwnMessage.value || isBotInOneToOne.value))) {
			return false
		}

		if (hasTalkFeature(message.value.token, 'edit-messages-note-to-self') && conversation.value.type === CONVERSATION.TYPE.NOTE_TO_SELF) {
			return true
		}

		return (Date.now() - message.value.timestamp * 1000 < ONE_DAY_IN_MS)
	})

	const isFileShare = computed(() => Object.keys(Object(message.value.messageParameters)).some((key) => key.startsWith('file')))

	const hideDownloadOption = computed(() => Object.values(Object(message.value.messageParameters) as ChatMessage['messageParameters']).some((value) => value.type === 'file' && value['hide-download'] === 'yes'))

	const isFileShareWithoutCaption = computed(() => message.value.message === '{file}' && isFileShare.value)

	const isDeleteable = computed(() => (hasTalkFeature(message.value.token, 'delete-messages-unlimited') || (Date.now() - message.value.timestamp * 1000 < 6 * ONE_HOUR_IN_MS))
		&& [MESSAGE.TYPE.COMMENT, MESSAGE.TYPE.VOICE_MESSAGE, MESSAGE.TYPE.RECORD_AUDIO, MESSAGE.TYPE.RECORD_VIDEO].includes(message.value.messageType)
		&& (isCurrentUserOwnMessage.value || (!isOneToOneConversation.value && store.getters.isModerator))
		&& isConversationModifiable.value)

	const remoteServer = computed(() => {
		return message.value.actorType === ATTENDEE.ACTOR_TYPE.FEDERATED_USERS
			? '(' + message.value.actorId.split('@').pop() + ')'
			: ''
	})

	const lastEditor = computed(() => {
		if (!message.value.lastEditTimestamp) {
			return ''
		} else if (message.value.lastEditActorId === message.value.actorId
			&& message.value.lastEditActorType === message.value.actorType) {
			// TRANSLATORS Edited by the author of the message themselves
			return t('spreed', '(edited)')
		} else if (message.value.lastEditActorId === currentActorId
			&& message.value.lastEditActorType === currentActorType) {
			return t('spreed', '(edited by you)')
		} else if (message.value.lastEditActorId === 'deleted_users'
			&& message.value.lastEditActorType === 'deleted_users') {
			return t('spreed', '(edited by a deleted user)')
		} else {
			return t('spreed', '(edited by {moderator})', { moderator: message.value.lastEditActorDisplayName! })
		}
	})

	const actorDisplayName = computed(() => {
		if ([ATTENDEE.ACTOR_TYPE.GUESTS, ATTENDEE.ACTOR_TYPE.EMAILS].includes(message.value.actorType)) {
			const guestNameStore = useGuestNameStore()
			return guestNameStore.getGuestName(message.value.token, message.value.actorId)
		} else {
			return message.value.actorDisplayName.trim()
		}
	})

	const actorDisplayNameWithFallback = computed(() => {
		return getDisplayNameWithFallback(actorDisplayName.value, message.value.actorType)
	})

	return {
		isEditable,
		isDeleteable,
		isCurrentUserOwnMessage,
		isBotInOneToOne,
		isObjectShare,
		isConversationModifiable,
		isConversationReadOnly,
		isFileShareWithoutCaption,
		isFileShare,
		hideDownloadOption,
		remoteServer,
		lastEditor,
		actorDisplayName,
		actorDisplayNameWithFallback,
	}
}
