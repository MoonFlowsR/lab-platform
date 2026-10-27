import { createContext } from 'react';
import { savedOptions } from './saved-options.js';

export const SavedOptionsContext = createContext(savedOptions());
