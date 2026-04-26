import { chat } from "../../../../../script.js";
import { selected_group, is_group_generating } from "../../../../../scripts/group-chats.js";
import { debug, getLastMessageWithTracker, getLastNonSystemMessageIndex, log } from "../lib/utils.js";
import { isEnabled } from "./settings/settings.js";
import { prepareMessageGeneration, addTrackerToMessage, clearInjects } from "./tracker.js";
import { releaseGeneration } from "../lib/interconnection.js";
import { FIELD_INCLUDE_OPTIONS, getTracker, OUTPUT_FORMATS, saveTracker } from "./trackerDataHandler.js";
import { TrackerInterface } from "./ui/trackerInterface.js";
import { extensionSettings } from "../index.js";
import { TrackerPreviewManager } from "./ui/trackerPreviewManager.js";

/**
 * Flag that is true while a chat is loading (between CHAT_CHANGED and
 * when all historical messages have been rendered). During this window,
 * render handlers only save already-prepared trackers, never generate new ones.
 */
let isChatLoading = false;

/**
 * Tracks the chat length at the time CHAT_CHANGED fired.
 * Messages with mesId below this threshold are historical (chat load/switch)
 * and should not trigger API calls even after the loading window expires.
 */
let lastChatLengthAtLoad = 0;

const CHAT_LOAD_TIMEOUT_MS = 4000;

/**
 * Event handler for when the chat changes.
 * Activates a loading window during which render handlers skip generation.
 * Captures chat length so historical messages remain blocked even after loading ends.
 * @param {object} args - The event arguments.
 */
async function onChatChanged(args) {
	isChatLoading = true;
	lastChatLengthAtLoad = chat.length;
	await clearInjects();
	if (!await isEnabled()) {
		setTimeout(() => { isChatLoading = false; }, CHAT_LOAD_TIMEOUT_MS);
		return;
	}
	log("Chat changed:", args);
	updateTrackerInterface();
	//TrackerPreviewManager.init();
	releaseGeneration();
	setTimeout(() => { isChatLoading = false; }, CHAT_LOAD_TIMEOUT_MS);
}

/**
 * Event handler for after generation commands.
 * @param {string} type - The type of generation.
 * @param {object} options - Generation options.
 * @param {boolean} dryRun - Whether it's a dry run.
 */
async function onGenerateAfterCommands(type, options, dryRun) {
	if(!extensionSettings.enabled) await clearInjects();
	const enabled = await isEnabled();
	if (!enabled || chat.length == 0 || isChatLoading || (selected_group && !is_group_generating) || (typeof type != "undefined" && !["normal","continue", "swipe", "regenerate", "impersonate", "group_chat"].includes(type))) {
		debug("GENERATION_AFTER_COMMANDS Tracker skipped", {extenstionEnabled: extensionSettings.enabled, freeToRun: enabled, selected_group, is_group_generating, type, isChatLoading});
		return;
	}
	if(type == "normal") type = undefined;
	log("GENERATION_AFTER_COMMANDS ", [type, options, dryRun]);
	await prepareMessageGeneration(type, options, dryRun);
	releaseGeneration();
}

/**
 * Event handler for when a message is received.
 * @param {number} mesId - The message ID.
 */
async function onMessageReceived(mesId) {
	if (!await isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	log("MESSAGE_RECEIVED", mesId);
	await addTrackerToMessage(mesId);
	releaseGeneration();
}

/**
 * Event handler for when a message is sent.
 * @param {number} mesId - The message ID.
 */
async function onMessageSent(mesId) {
	if (!await isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	log("MESSAGE_SENT", mesId);
	await addTrackerToMessage(mesId);
	releaseGeneration();
}

/**
 * Event handler for when a character's message is rendered.
 * During chat loading or for historical messages: only saves prepared trackers, never generates.
 * For new messages during conversation: generates trackers normally.
 */
async function onCharacterMessageRendered(mesId) {
	if (!await isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	
	// Skip generation during chat loading window OR for historical messages
	if (isChatLoading || mesId < lastChatLengthAtLoad) {
		log("CHARACTER_MESSAGE_RENDERED (skip generation)");
		await addTrackerToMessage(mesId, true);
		releaseGeneration();
		updateTrackerInterface();
		return;
	}
	
	// New messages during conversation proceed normally with generation
	log("CHARACTER_MESSAGE_RENDERED");
	await addTrackerToMessage(mesId);
	releaseGeneration();
	updateTrackerInterface();
}

/**
 * Event handler for when a user's message is rendered.
 * During chat loading or for historical messages: only saves prepared trackers, never generates.
 * For new messages during conversation: generates trackers normally.
 */
async function onUserMessageRendered(mesId) {
	if (!await isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	
	// Skip generation during chat loading window OR for historical messages
	if (isChatLoading || mesId < lastChatLengthAtLoad) {
		log("USER_MESSAGE_RENDERED (skip generation)");
		await addTrackerToMessage(mesId, true);
		releaseGeneration();
		updateTrackerInterface();
		return;
	}
	
	// New messages during conversation proceed normally with generation
	log("USER_MESSAGE_RENDERED");
	await addTrackerToMessage(mesId);
	releaseGeneration();
	updateTrackerInterface();
}

async function generateAfterCombinePrompts(prompt) {
	debug("GENERATE_AFTER_COMBINE_PROMPTS", {prompt});
}

export const eventHandlers = {
	onChatChanged,
	onGenerateAfterCommands,
	onMessageReceived,
	onMessageSent,
	onCharacterMessageRendered,
	onUserMessageRendered,
	generateAfterCombinePrompts
};

function updateTrackerInterface() {
	const lastMesWithTrackerId = getLastMessageWithTracker();
	const tracker = chat[lastMesWithTrackerId]?.tracker ?? {};
	if(Object.keys(tracker).length === 0) return;
	const trackerData = getTracker(tracker, extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, false, OUTPUT_FORMATS.JSON); // Get tracker data for the last message
	const onSave = (updatedTracker) => {
		saveTracker(updatedTracker, extensionSettings.trackerDef, lastMesWithTrackerId);
	};
	const trackerInterface = new TrackerInterface();
	trackerInterface.init(trackerData, lastMesWithTrackerId, onSave);
}
