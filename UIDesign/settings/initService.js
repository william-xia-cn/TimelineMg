/**
 * initService.js (Mock Implementation - Vanilla JS)
 */
import { configService } from './configService.js';

class InitService {
    async runWizard() {
        const steps = [];
        
        try {
            // Step 1: Auth
            steps.push({ step: 'auth', status: 'completed' });
            
            // Step 2: Create Spreadsheet
            await new Promise(r => setTimeout(r, 500));
            steps.push({ step: 'config', status: 'completed' });
            
            // Step 3: Create Containers
            await new Promise(r => setTimeout(r, 500));
            steps.push({ step: 'containers', status: 'completed' });
            
            // Step 4: Create Default Plans
            await new Promise(r => setTimeout(r, 500));
            steps.push({ step: 'plans', status: 'completed' });
            
            // Step 5: Mark complete
            configService.updateConfig({
                initialized_at: new Date().toISOString(),
                version: '1.0.0'
            });
            steps.push({ step: 'complete', status: 'completed' });
            
            return { success: true, steps };
        } catch (e) {
            console.error('Init failed:', e);
            return { success: false, steps };
        }
    }

    isInitialized() {
        return configService.isInitialized();
    }
}

export const initService = new InitService();
