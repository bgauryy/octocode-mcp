// Main exports with new names
export { tokenOptimizer, tokenOptimizerConfig } from './tokenOptimizer';
export { minifyContent } from './minifier';

// Backward compatibility exports (deprecated)
export {
  tokenOptimizer as jsonToYamlString,
  tokenOptimizerConfig as YamlConversionConfig,
} from './tokenOptimizer';
