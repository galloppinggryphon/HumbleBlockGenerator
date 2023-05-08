'use strict'
import chalk from 'chalk'
import nodePath from 'path'
import {
	stringHasPrefix,
	resolveTemplateStrings,
	resolveTemplateStringsRecursively,
} from '../../lib/utils.js'
import { saveFileAsync, eraseDirContentsAsync } from '../../lib/fs-utils.js'
import {
	generatorPaths,
	logger,
} from '../generator-config.js'
import appData from '../../app-data.js'
import { loadBlockTemplate, loadBlockTemplateFiles, loadJson, loadTemplateScripts } from './template-loaders.js'
import display, { log } from '../../lib/display.js'
import generateBlocks from './block-generator.js'

/**
 * Main process for generating blocks.
 */
export default async function runBlockGenerator() {
	const { generatorData } = appData
	const { output } = generatorData

	if ( ! await blockGeneratorSetup() ) {
		return
	}

	await eraseDirContentsAsync( output.paths.BP, { restrictPathsToCwd: false } )

	// ~ Generate blocks ~
	// Traverse block template files
	const { titles, counter } = await parseBlockFiles()

	// ~ Generate text file with block titles ~
	logger.setContext( null )
	await writeTranslationFile( titles )

	displayResults( counter )
}

/**
 * Iterate over each file and run block generator.
 */
async function parseBlockFiles() {
	const { blockFiles } = appData.generatorData.input

	const data = {
		blocks: [],
		titles: [],
		counter: 0,
	}

	if ( ! blockFiles || ! blockFiles.length ) {
		return data
	}

	blockFiles.forEach( ( file ) => {
		if ( ! file ) {
			return
		}

		logger.setContext( null )
		const { fileName, blockData } = loadBlockTemplate( file ) ?? {}

		if ( fileName ) {
			logger.setContext( logger.BLOCK_BUILDER )
			generateBlocks( { fileName, blockData, results: data } )
		}
	} )

	await Promise.all( data.blocks )

	return data
}

function displayResults( blockCounter ) {
	const result = []

	// ~ Feedback ~
	if ( blockCounter ) {
		const prefix = 'Generated'
		const rawNumField = ` ${ blockCounter } `
		const suffix = `block${ blockCounter > 1 ? 's' : '' }`
		const numField = chalk.bgYellow( rawNumField )

		result.push( prefix, numField, suffix )
	}
	else {
		const rawMsg = 'Uh-oh, no blocks were generated.'
		result.push( chalk.yellow( rawMsg ) )
	}

	const msg = [
		result.join( ' ' ),
	]

	if ( logger.hasMessages( 3 ) ) {
		msg.push( ' ' )
		msg.push(
			chalk.bold(
				chalk.bgRedBright( ' WARNING ' ) +
				chalk.bgWhite( ' Errors occurred during processing! ' ),
			),
		)
	}

	if ( logger.hasMessages() ) {
		display.lb( 2 )
		log( '------------------------------------------------------------' )
		log( 'Block generator complete.' )
		log( '------------------------------------------------------------' )

		log( '' )
		log( chalk.bgMagenta( chalk.bold( '  LOG MESSAGES  ' ) ) )
		logger.printLog()
	}

	display.lb( 2 )
	display.box(
		chalk.bold( '  BLOCK GENERATOR RESULTS  ' ),
		msg,
	)

	display.lb( 2 )
}

async function blockGeneratorSetup() {
	const paths = setupInputPaths()

	const { generatorData, settings } = appData
	const templateData = await loadJson( paths.jsonFiles )

	if ( ! Object.keys( templateData ).length ) {
		return
	}

	generatorData.input.blockFiles = await loadBlockTemplateFiles( paths.blocks )
	generatorData.materialConfig = templateData.materials
	generatorData.scaffolding = templateData.scaffolding

	// !! Deprecate?
	// Todo: remove template scripts?
	const templateScripts = await loadTemplateScripts( paths.presetScriptFiles )

	// Prepare preset templates
	if ( templateScripts.presetScripts ) {
		Object.values( templateScripts ).reduce( ( result, value ) => {
			if ( typeof value === 'function' ) {
				// Attach utility functions to make them available in preset files
				Object.assign(
					result,
					value( {
						prefix: settings.prefix,
						logger,
						log,
						utils: {
							stringHasPrefix,
							resolveTemplateStrings,
							resolveTemplateStringsRecursively,
						},
					} ),
				)
			}
			else {
				Object.assign( result, value )
			}
			return result
		}, templateScripts )
	}

	// Merge bundled presets
	generatorData.presets = Object.assign( {}, templateData.presets, templateData.bundledPresets )
	generatorData.presetScripts = Object.assign( {}, templateScripts.presetScripts, templateScripts.bundledPresetScripts )

	return true
}

function setupInputPaths() {
	const { settings, generatorData, scriptArgs } = appData
	const { configPath, rootPath, templatePath } = appData.paths
	const { blockConfigDir, presets, scaffolding, presetScripts, materials } = settings.input
	const { input } = generatorData

	input.blockConfigPath = nodePath.resolve( configPath, blockConfigDir || './' )

	const bundledPresetsPath = nodePath.join( rootPath, generatorPaths.bundledPresetsDir )

	const jsonFiles = {
		bundledPresets: nodePath.join( bundledPresetsPath, 'presets.json' ),
		materials: nodePath.join( configPath, materials ),
		presets: nodePath.join( configPath, presets ),
		scaffolding: nodePath.join( configPath, scaffolding ),
	}

	const presetScriptFiles = {
		presetScripts: nodePath.join( configPath, presetScripts ),
		// bundledPresetScripts: nodePath.join( bundledPresetsPath, 'presets.js' ),
	}

	const blocks = scriptArgs.blocks && scriptArgs.blocks.length
		? scriptArgs.blocks
		: settings.input.blocks

	return {
		blocks,
		jsonFiles,
		presetScriptFiles,
	}
}

async function writeTranslationFile( blockTitles ) {
	const { settings, generatorData } = appData
	const { output } = generatorData
	const { language } = settings.output

	const textDir = nodePath.join( output.basePath, 'RP', 'texts' )
	const textFile = `${ language }.lang`
	const err = await saveFileAsync( textDir, textFile, blockTitles.join( '\n' ) )

	if ( err ) {
		logger.error(
			`Could not write block titles to text file (${ nodePath.join(
				textDir,
				textFile,
			) }).`,
			err,
		)
	}
}
