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

// BUG FIX: prevent API spam on chat load
let _chatLoading = false, _chatLoadTimer = null;
export function setChatLoading() {
    _chatLoading = true;
    if (_chatLoadTimer) clearTimeout(_chatLoadTimer);
    _chatLoadTimer = setTimeout(() => { _chatLoading = false; }, 1500);
}
export function isChatCurrentlyLoading() { return _chatLoading; }

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