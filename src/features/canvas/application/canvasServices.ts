import { InMemoryCanvasEventBus } from './eventBus';
import { DefaultGraphImageResolver } from './graphImageResolver';
import { DefaultGraphPromptResolver } from './graphPromptResolver';
import { nodeCatalog } from './nodeCatalog';
import { CanvasNodeFactory } from './nodeFactory';
import { CanvasToolProcessor } from './toolProcessor';
import { uuidGenerator } from '../infrastructure/idGenerator';
import { tauriAiGateway } from '../infrastructure/tauriAiGateway';
import { tauriImageSplitGateway } from '../infrastructure/tauriImageSplitGateway';

export const canvasEventBus = new InMemoryCanvasEventBus();
export const canvasNodeFactory = new CanvasNodeFactory(uuidGenerator, nodeCatalog);
export const graphImageResolver = new DefaultGraphImageResolver();
export const graphPromptResolver = new DefaultGraphPromptResolver();
export const canvasToolProcessor = new CanvasToolProcessor(tauriImageSplitGateway, uuidGenerator);
export const canvasAiGateway = tauriAiGateway;
