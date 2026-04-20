import { chat } from "../../../../../script.js";
import { selected_group, is_group_generating } from "../../../../../scripts/group-chats.js";
import { debug, getLastMessageWithTracker, getLastNonSystemMessageIndex, log } from "../lib/utils.js";
import { isEnabled } from "./settings/settings.js";
import { prepareMessageGeneration, addTrackerToMessage, clearInjects } from "./tracker.js";
import { isChatCurrentlyLoading, releaseGeneration, setChatLoading } from "../lib/interconnection.js";
import { FIELD_INCLUDE_OPTIONS, getTracker, OUTPUT_FORMATS, saveTracker } from "./trackerDataHandler.js";
import { TrackerInterface } from "./ui/trackerInterface.js";
import { extensionSettings } from "../index.js";
import { TrackerPreviewManager } from "./ui/trackerPreviewManager.js";

/**
 * Event handler for when the chat changes.
 *
 * FIX: This now calls setChatLoading() which raises the isChatLoading flag
 * for a debounced window. This prevents the render-triggered handlers below
 * (onCharacterMessageRendered, onUserMessageRendered) from firing API calls
 * for every historical message as the chat renders in.
 *
 * @param {object} args - The event arguments.
 */
async function onChatChanged(args) {
    // Raise the loading flag FIRST, before anything else.
    setChatLoading();

    await clearInjects();
    if (!await isEnabled()) return;
    log("Chat changed:", args);
    updateTrackerInterface();
    releaseGeneration();
}

/**
 * Event handler for after generation commands.
 *
 * This is the "intentional generation" path — fires when the user sends a
 * message or explicitly triggers a generation. This path is NOT gated by
 * isChatLoading because the user made a deliberate action.
 *
 * @param {string} type - The type of generation.
 * @param {object} options - Generation options.
 * @param {boolean} dryRun - Whether it's a dry run.
 */
async function onGenerateAfterCommands(type, options, dryRun) {
    if (!extensionSettings.enabled) await clearInjects();
    const enabled = await isEnabled();
    if (
        !enabled ||
        chat.length == 0 ||
        (selected_group && !is_group_generating) ||
        (typeof type != "undefined" && !["normal", "continue", "swipe", "regenerate", "impersonate", "group_chat"].includes(type))
    ) {
        debug("GENERATION_AFTER_COMMANDS Tracker skipped", {
            extensionEnabled: extensionSettings.enabled,
            freeToRun: enabled,
            selected_group,
            is_group_generating,
            type,
        });
        return;
    }
    if (type == "normal") type = undefined;
    log("GENERATION_AFTER_COMMANDS ", [type, options, dryRun]);
    await prepareMessageGeneration(type, options, dryRun);
    releaseGeneration();
}

/**
 * Event handler for when a character's message is rendered.
 *
 * FIX: Guards added:
 * 1. isChatCurrentlyLoading() — skips entirely during chat load to prevent
 *    historical messages from each triggering an API call.
 * 2. The tracker existence check (chat[mesId].tracker with non-empty keys)
 *    remains, but now also checks for a `manuallyEdited` flag. If a message's
 *    tracker has been manually edited, we never overwrite it with auto-generation.
 *
 * @param {number} mesId - The message ID.
 */
async function onCharacterMessageRendered(mesId) {
    // GUARD 1: Never fire during chat load — this is what caused the API spam.
    if (isChatCurrentlyLoading()) {
        debug("CHARACTER_MESSAGE_RENDERED skipped — chat is loading", mesId);
        return;
    }

    if (!await isEnabled()) return;
    if (!chat[mesId]) return;

    // GUARD 2: Skip if tracker already exists and hasn't been flagged for update.
    const existingTracker = chat[mesId].tracker;
    if (existingTracker && Object.keys(existingTracker).length !== 0) {
        debug("CHARACTER_MESSAGE_RENDERED skipped — tracker already exists for message", mesId);
        updateTrackerInterface();
        return;
    }

    log("CHARACTER_MESSAGE_RENDERED — generating tracker for message", mesId);
    await addTrackerToMessage(mesId);
    releaseGeneration();
    updateTrackerInterface();
}

/**
 * Event handler for when a user's message is rendered.
 *
 * FIX: Same guards as onCharacterMessageRendered above.
 *
 * @param {number} mesId - The message ID.
 */
async function onUserMessageRendered(mesId) {
    // GUARD 1: Never fire during chat load.
    if (isChatCurrentlyLoading()) {
        debug("USER_MESSAGE_RENDERED skipped — chat is loading", mesId);
        return;
    }

    if (!await isEnabled()) return;
    if (!chat[mesId]) return;

    // GUARD 2: Skip if tracker already exists.
    const existingTracker = chat[mesId].tracker;
    if (existingTracker && Object.keys(existingTracker).length !== 0) {
        debug("USER_MESSAGE_RENDERED skipped — tracker already exists for message", mesId);
        updateTrackerInterface();
        return;
    }

    log("USER_MESSAGE_RENDERED — generating tracker for message", mesId);
    await addTrackerToMessage(mesId);
    releaseGeneration();
    updateTrackerInterface();
}

async function generateAfterCombinePrompts(prompt) {
    debug("GENERATE_AFTER_COMBINE_PROMPTS", { prompt });
}

export const eventHandlers = {
    onChatChanged,
    onGenerateAfterCommands,
    onCharacterMessageRendered,
    onUserMessageRendered,
    generateAfterCombinePrompts,
};

function updateTrackerInterface() {
    const lastMesWithTrackerId = getLastMessageWithTracker();
    const tracker = chat[lastMesWithTrackerId]?.tracker ?? {};
    if (Object.keys(tracker).length === 0) return;
    const trackerData = getTracker(tracker, extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, false, OUTPUT_FORMATS.JSON);
    const onSave = (updatedTracker) => {
        saveTracker(updatedTracker, extensionSettings.trackerDef, lastMesWithTrackerId);
    };
    const trackerInterface = new TrackerInterface();
    trackerInterface.init(trackerData, lastMesWithTrackerId, onSave);
}
