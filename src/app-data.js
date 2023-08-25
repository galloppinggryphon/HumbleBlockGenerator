'use strict'
import fs from 'fs'
import nodePath from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { log } from './lib/utils.js'
import pathConfig from '../paths.js'
import { readFile, saveFileAsync } from './lib/fs-utils.js'

const proxyData = /** @type {Application.AppData} */ ( {
	uninitialized: true,
	generatorData: {
		output: {
			basePath: '',
			baseDir: '',
			paths: {},
		},
		input: {
			blockConfigPath: '',
			blocks: {},
			blockFiles: [],
		},
		presetScripts: {},
		presets: {},
		materialConfig: {},
		scaffolding: {},
	},

	scriptArgs: {},
	settings: undefined,
	paths: {
		defaultConfigDir: undefined,
		configDir: undefined,
		rootPath: undefined,
		templateDir: undefined,
		templatePath: undefined,
	},
} )

/**
 * Application state manager
 */
const appData = new Proxy( proxyData, {} )

if ( appData.uninitialized ) {
	delete appData.uninitialized
	appData.paths.defaultConfigDir = 'config'

	// import.meta.url = local url to current file
	const __dirname = nodePath.dirname( fileURLToPath( import.meta.url ) )
	const rootPath = nodePath.resolve( `${ __dirname }/..` )
	appData.paths.rootPath = rootPath
}

export function loadSavedAppData() {
	const fname = nodePath.resolve( appData.paths.rootPath, '~app-data.json' )
	const _appData = readFile( fname )
	const json = JSON.parse( _appData )
	Object.assign( proxyData, json )
}

export async function initAppData() {
	const { paths } = appData
	const { rootPath } = paths

	if ( ! fs.existsSync( nodePath.join( rootPath, 'node_modules' ) ) ) {
		log( `\n🟠 Humble Block Generator has not been installed yet!\n\nRun 'npm install' first.` )
		return
	}

	paths.templateDir = pathConfig.templates
	paths.templatePath = nodePath.join( rootPath, paths.templateDir )

	paths.configDir = pathConfig?.configDir || 'config'
	paths.configPath = nodePath.resolve( rootPath, paths.configDir )

	if ( ! fs.existsSync( paths.configPath ) ) {
		log( `\n⛔ ERROR: config directory not found!\n` )
		return false
	}

	const configFile = nodePath.join( paths.configPath, 'config.js' )

	if ( ! fs.existsSync( configFile ) ) {
		log( `\n⛔ ERROR: 'config.js' not found!\n\nRun 'npm run init' to create.\n` )
		return false
	}

	const configUrl = pathToFileURL( configFile )
	// @ts-ignore
	const config = await import( configUrl )
	appData.settings = config.default

	return true
}

export function saveAppDataToDisk() {
	saveFileAsync( appData.paths.rootPath, '~app-data.json', JSON.stringify( appData, null, 4 ) )
}

export default appData
