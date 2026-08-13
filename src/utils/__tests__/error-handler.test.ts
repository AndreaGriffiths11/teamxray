import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

vi.mock('vscode', () => ({
    window: {
        showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
        showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
    },
}));

import { ErrorHandler } from '../error-handler';
import { ResourceManager } from '../resource-manager';

function createOutputChannel(): vscode.OutputChannel {
    return {
        appendLine: vi.fn(),
        show: vi.fn(),
    } as unknown as vscode.OutputChannel;
}

describe('ErrorHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('preserves structured Team X-Ray errors', async () => {
        const outputChannel = createOutputChannel();
        ErrorHandler.initialize(outputChannel);
        const error = ErrorHandler.createError(
            'ANALYSIS_FAILED',
            'Copilot session did not return a response',
            'Try the analysis again after checking the Team X-Ray output.',
            true,
            { provider: 'copilot' }
        );

        const result = await ErrorHandler.withErrorHandling(async () => {
            throw error;
        }, 'analyze repository');

        expect(result).toBeNull();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            '[ANALYSIS_FAILED] Copilot session did not return a response'
        );
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            'Context: {\n  "provider": "copilot"\n}'
        );
    });
});

describe('ResourceManager', () => {
    it('does not install process-wide exception handlers', () => {
        const uncaughtExceptionListeners = process.listenerCount('uncaughtException');
        const unhandledRejectionListeners = process.listenerCount('unhandledRejection');

        ResourceManager.getInstance();

        expect(process.listenerCount('uncaughtException')).toBe(uncaughtExceptionListeners);
        expect(process.listenerCount('unhandledRejection')).toBe(unhandledRejectionListeners);
    });
});
