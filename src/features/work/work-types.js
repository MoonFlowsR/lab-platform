import definitions from '../../config/work-types.json' with { type: 'json' };

export const WORK_DEFINITIONS = definitions;
export const WORK_MODULES = definitions.map(item => item.module);
export const workDefinition = type => definitions.find(item => item.name === type);
export const workFeeKey = type => workDefinition(type)?.feeKey || 'cost_test';
export const workModule = type => workDefinition(type)?.module || 'test';
