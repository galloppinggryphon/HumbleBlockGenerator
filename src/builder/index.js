'use strict'
import nodePath from 'path'
import {
	eraseDirContentsAsync,
	pathExists,
	isChildOfDirectory,
} from '../lib/fs-utils.js'
import appData, { initAppData } from '../app-data.js'
import runBlockGenerator from './block-generator/index.js'
import chalk from 'chalk'
import { runModelGenerator } from './model-generator/index.js'
import display, { log } from '../lib/display.js'

export default async function runBuilder( { createModels = false, createBlocks = true } ) {
	if ( ! appData.settings ) {
		if ( ! await initAppData() ) {
			return
		}
	}

	const { scriptArgs, settings, generatorData, paths } = appData

	// eslint-disable-next-line no-unused-vars
	const { blocks, outputDir, ...rest } = scriptArgs

	if ( rest && Object.keys( rest ).length ) {
		console.error( '⛔ Error! Invalid script argument(s):\n', rest, '\n\n' )
		return
	}

	if ( ! setupOutputPaths() ) {
		return
	}

	const { output } = generatorData
	const { allowOutputOutsideConfigDir } = settings.output

	log( '\n📁 Output Path:\n  ', output.basePath )

	if ( ! allowOutputOutsideConfigDir && ! isChildOfDirectory( output.basePath, paths.configDir ) ) {
		display.error( `Invalid output directory: ${ output.basePath }.` )
		log( 'Not allowed outside descendants of the HUB root directory (unless enabled in config.js).\n\n' )
		log()
		return
	}

	if ( createModels ) {
		await errorBoundary( async() => {
			const modelPath = nodePath.join( output.paths.RP, 'models' )
			await eraseDirContentsAsync( modelPath, { restrictPathsToCwd: false } )
			await runModelGenerator()
		} )
	}

	if ( createBlocks ) {
		await errorBoundary( async() => {
			await runBlockGenerator()
		} )
	}

	return true
}

async function errorBoundary( fn ) {
	try {
		await fn()
	}
	catch ( e ) {
		log()
		console.error( `⛔   ${ chalk.bold.bgRedBright( '  Crash! The block generator has aborted because of serious errors.  ' ) }   ⛔` )
		log()
		log( e )
		log()
		return false
	}

	return true
}

function setupOutputPaths() {
	const { settings, scriptArgs, generatorData, paths } = appData
	const { output } = generatorData

	if ( ! scriptArgs.outputDir && ! settings.output.outputDir ) {
		console.error( 'Error: No output directory is configured!\n\nUse config.js to define a directory or specify with an argument.' )
		return
	}

	output.outputDir = scriptArgs.outputDir ? scriptArgs.outputDir : settings.output.outputDir

	if ( typeof output.outputDir !== 'string' ) {
		console.error( `\nError: output directory must be a string!\n\nConfigured or received output directory: ${ typeof output.outputDir }).` )
		return
	}

	const outputPath = nodePath.resolve( paths.configPath, output.outputDir )

	if ( ! pathExists( outputPath ) ) {
		throw new Error( `Path does not exist: ${ outputPath }` )
	}

	generatorData.output.basePath = outputPath
	generatorData.output.paths = {
		BP: nodePath.join( outputPath, 'BP' ),
		RP: nodePath.join( outputPath, 'RP' ),
	}

	return true
}
