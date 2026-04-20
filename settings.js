import { extensionName } from '../index.js';
import { eventSource } from '../../../../../script.js';
import { log } from './utils.js';

const NO_CAPTURES = '';
const generationMutexEvents = {
    MUTEX_CAPTURED: 'GENERATION_MUTEX_CAPTURED',
    MUTEX_RELEASED: 'GENERATION_MUTEX_RELEASED',
    TRACKER_PREVIEW_ADDED: 'TRACKER_PREVIEW_ADDED',
    TRACKER_PREVIEW_UPDATED: 'TRACKER_PREVIEW_UPDATED'
};

/**
 * @typedef {object} GenerationMutexEvent
 * @property {string} extension_name - the name of the extension that captures the mutex
 */

let capturedBy = NO_CAPTURES;

/**
 * FIX: isChatLoading flag.
 *
 * The original bug: when a chat loads, ST fires CHARACTER_MESSAGE_RENDERED
 * once per message in history. The original code had no guard against this,
 * so every historical message without a saved tracker triggered a fresh API
 * call. With a long chat history this meant dozens of simultaneous generation
 * requests — the "burning money" bug.
 *
 * The fix: we set isChatLoading = true the moment CHAT_CHANGED fires, and
 * reset it to false after a short delay once rendering is complete. All
 * generation handlers check this flag and skip if it's true. Only the
 * GENERATION_AFTER_COMMANDS path (which fires when the user actually sends a
 * message or triggers a generation) is allowed to proceed during or after
 * a chat change.
 */
let isChatLoading = false;
let chatLoadingTimer = null;
const CHAT_LOADING_DEBOUNCE_MS = 1000;

/**
 * Call this when CHAT_CHANGED fires. Sets the loading flag and starts a
 * timer to clear it once all the render events have settled.
 */
export function setChatLoading() {
    isChatLoading = true;
    if (chatLoadingTimer) clearTimeout(chatLoadingTimer);
    chatLoadingTimer = setTimeout(() => {
        isChatLoading = false;
        chatLoadingTimer = null;
        log('Chat loading complete — generation re-enabled');
    }, CHAT_LOADING_DEBOUNCE_MS);
    log('Chat loading started — generation suspended');
}

/**
 * Returns true if the chat is currently in the process of loading/rendering.
 * Generation handlers should bail out early when this is true.
 * @returns {boolean}
 */
export function isChatCurrentlyLoading() {
    return isChatLoading;
}

/**
 * @return {void}
 */
export function registerGenerationMutexListeners() {
    eventSource.on(generationMutexEvents.MUTEX_CAPTURED, onGenerationMutexCaptured);
    eventSource.on(generationMutexEvents.MUTEX_RELEASED, onGenerationMutexReleased);
}

/**
 * @return {boolean}
 */
export async function generationCaptured() {
    if (capturedBy === extensionName) {
        return true;
    }

    if (capturedBy === NO_CAPTURES) {
        await eventSource.emit(generationMutexEvents.MUTEX_CAPTURED, {extension_name: extensionName});
        return true;
    }

    return false;
}

/**
 * @return {void}
 */
export async function releaseGeneration() {
    await eventSource.emit(generationMutexEvents.MUTEX_RELEASED);
}

/**
 * @param {GenerationMutexEvent} event
 * @return {void}
 */
function onGenerationMutexCaptured(event) {
    capturedBy = event.extension_name;
    log('Generation mutex captured by', capturedBy);
}

/**
 * @return {void}
 */
function onGenerationMutexReleased() {
    capturedBy = NO_CAPTURES;
    log('Generation mutex released');
}

/**
 * @return {void}
 */
export async function emitTrackerPreviewAdded(mesId, element) {
    await eventSource.emit(generationMutexEvents.TRACKER_PREVIEW_ADDED, mesId, element);
}

/**
 * @return {void}
 */
export async function emitTrackerPreviewUpdated(mesId, element) {
    await eventSource.emit(generationMutexEvents.TRACKER_PREVIEW_UPDATED, mesId, element);
}
