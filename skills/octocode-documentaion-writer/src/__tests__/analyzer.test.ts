import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { analyzeRepository, quickAnalyze, analyzePackageJson, isMonorepo, analyzeExportsMap } from '../index.js';

// ES module path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixtures path (use the skill package itself as test subject)
// __dirname is skills/octocode-documentaion-writer/src/__tests__
// We want skills/octocode-documentaion-writer
const FIXTURE_PATH = path.resolve(__dirname, '../..');
const TEMP_OUTPUT = path.resolve(__dirname, '../../.test-output');
const MONOREPO_ROOT = path.resolve(FIXTURE_PATH, '../..');

describe('package-analyzer', () => {
  const packageJsonPath = path.join(FIXTURE_PATH, 'package.json');

  describe('analyzePackageJson', () => {
    it('should parse package.json correctly', async () => {
      const config = await analyzePackageJson(packageJsonPath);

      expect(config.name).toBe('octocode-documentaion-writer');
      expect(config.version).toBe('1.0.0');
      expect(config.entryPoints.main).toBe('scripts/index.js');
      expect(config.entryPoints.all.size).toBeGreaterThan(0);
    });

    it('should extract entry points from exports field', async () => {
      const config = await analyzePackageJson(packageJsonPath);

      // Should have entries from main, types, and exports
      expect(config.entryPoints.all.has('scripts/index.js')).toBe(true);
      expect(config.entryPoints.all.has('scripts/index.d.ts')).toBe(true);
    });

    it('should extract bin entries', async () => {
      const config = await analyzePackageJson(packageJsonPath);

      expect(config.entryPoints.bin).toBeDefined();
      expect(config.entryPoints.bin?.get('octocode-doc-writer')).toBe('./scripts/index.js');
    });

    it('should extract dependencies', async () => {
      const config = await analyzePackageJson(packageJsonPath);

      expect(config.dependencies.production).toContain('ts-morph');
      expect(config.dependencies.development).toContain('typescript');
      expect(config.dependencies.all.has('ts-morph')).toBe(true);
    });

    it('should extract scripts', async () => {
      const config = await analyzePackageJson(packageJsonPath);

      expect(config.scripts.build).toBe('tsdown');
      expect(config.scripts.analyze).toBeDefined();
    });
  });

  describe('isMonorepo', () => {
    it('should return false for non-monorepo packages', async () => {
      const result = await isMonorepo(FIXTURE_PATH);
      expect(result).toBe(false);
    });

    it('should return true for monorepo root', async () => {
      const result = await isMonorepo(MONOREPO_ROOT);
      expect(result).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      const result = await isMonorepo('/non/existent/path');
      expect(result).toBe(false);
    });
  });

  describe('analyzeExportsMap', () => {
    it('should analyze exports field correctly', async () => {
      const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      const analysis = analyzeExportsMap(packageJson, FIXTURE_PATH);

      expect(analysis.paths).toBeDefined();
      expect(Array.isArray(analysis.paths)).toBe(true);
      expect(analysis.wildcards).toBeDefined();
      expect(analysis.internalOnly).toBeDefined();
    });

    it('should handle packages without exports field', async () => {
      const packageJson = { name: 'test', version: '1.0.0' };
      const analysis = analyzeExportsMap(packageJson, FIXTURE_PATH);

      expect(analysis.paths).toHaveLength(0);
      expect(analysis.wildcards).toHaveLength(0);
    });
  });
});

describe('quickAnalyze', () => {
  it('should perform quick analysis without writing files', async () => {
    const analysis = await quickAnalyze(FIXTURE_PATH);

    expect(analysis.metadata).toBeDefined();
    expect(analysis.metadata.repositoryPath).toBe(FIXTURE_PATH);
    expect(analysis.package.name).toBe('octocode-documentaion-writer');
    expect(analysis.files).toBeDefined();
    expect(Array.isArray(analysis.files)).toBe(true);
    expect(analysis.files.length).toBeGreaterThan(0);
  });

  it('should detect module graph', async () => {
    const analysis = await quickAnalyze(FIXTURE_PATH);

    expect(analysis.moduleGraph).toBeDefined();
    expect(analysis.moduleGraph.totalFiles).toBeGreaterThan(0);
    expect(analysis.moduleGraph.totalExports).toBeGreaterThan(0);
  });

  it('should detect architecture', async () => {
    const analysis = await quickAnalyze(FIXTURE_PATH);

    expect(analysis.architecture).toBeDefined();
    expect(analysis.architecture?.pattern).toBeDefined();
    expect(['layered', 'feature-based', 'flat', 'monorepo', 'unknown']).toContain(
      analysis.architecture?.pattern
    );
  });

  it('should extract public API', async () => {
    const analysis = await quickAnalyze(FIXTURE_PATH);

    expect(analysis.publicAPI).toBeDefined();
    expect(Array.isArray(analysis.publicAPI)).toBe(true);
  });

  it('should analyze dependencies', async () => {
    const analysis = await quickAnalyze(FIXTURE_PATH);

    expect(analysis.dependencies).toBeDefined();
    expect(analysis.dependencies.declared).toBeDefined();
    expect(analysis.dependencies.used).toBeDefined();
  });
});

describe('analyzeRepository', () => {
  beforeAll(async () => {
    // Create temp output directory
    await fs.promises.mkdir(TEMP_OUTPUT, { recursive: true });
  });

  afterAll(async () => {
    // Clean up temp output
    await fs.promises.rm(TEMP_OUTPUT, { recursive: true, force: true });
  });

  it('should generate analysis output files', async () => {
    const analysis = await analyzeRepository(FIXTURE_PATH, TEMP_OUTPUT);

    // Verify analysis object
    expect(analysis.metadata).toBeDefined();
    expect(analysis.metadata.duration).toBeGreaterThan(0);

    // Verify output files (output.ts writes analysis.json, not static-analysis.json)
    const analysisJsonPath = path.join(TEMP_OUTPUT, 'analysis.json');
    expect(fs.existsSync(analysisJsonPath)).toBe(true);

    const summaryPath = path.join(TEMP_OUTPUT, 'ANALYSIS_SUMMARY.md');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const publicApiPath = path.join(TEMP_OUTPUT, 'PUBLIC_API.md');
    expect(fs.existsSync(publicApiPath)).toBe(true);
  }, 30000); // 30s timeout for full analysis

  it('should throw error for invalid path', async () => {
    await expect(analyzeRepository('/non/existent/path')).rejects.toThrow('No package.json found');
  });

  it('should include enhanced analysis features', async () => {
    const analysis = await analyzeRepository(FIXTURE_PATH, TEMP_OUTPUT);

    // Check enhanced features
    expect(analysis.exportFlows).toBeDefined();
    expect(analysis.dependencyUsage).toBeDefined();
    expect(analysis.architecture).toBeDefined();
    expect(analysis.exportsMap).toBeDefined();
  }, 30000);
});

describe('types', () => {
  it('should have correct file roles', async () => {
    const analysis = await quickAnalyze(FIXTURE_PATH);

    const roles = analysis.files.map((f) => f.role);
    const validRoles = ['entry', 'config', 'test', 'util', 'component', 'service', 'type', 'barrel', 'unknown'];

    for (const role of roles) {
      expect(validRoles).toContain(role);
    }
  });

  it('should identify barrel files correctly', async () => {
    const analysis = await quickAnalyze(FIXTURE_PATH);

    // index.ts should be identified
    const indexFile = analysis.files.find((f) => f.relativePath === 'src/index.ts');
    expect(indexFile).toBeDefined();
    expect(indexFile?.exportCount).toBeGreaterThan(0);
  });
});
