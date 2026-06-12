const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

function escapePath(filePath) {
    return filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ignoredPaths = [
    '.venv',
    '.pytest_cache',
    '.deepeval',
    'backend/venv',
    'backend/uploads',
    'backend/results',
    'backend/dataset',
    'backend/__pycache__',
].map(relativePath => new RegExp(`^${escapePath(path.join(projectRoot, relativePath))}\\/.*`));

const config = getDefaultConfig(projectRoot);

config.resolver.blockList = [
    ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
    ...ignoredPaths,
];

module.exports = config;
