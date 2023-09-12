'use strict'
import _ from 'lodash'
import {
	reducer,
	recursivePrefixer,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	setObjValueByPath,
} from '../../lib/utils.js'
import { blockFormatVersion, formatVersionCompatibilityTable } from '../generator-config.js'
import {
	applyActions,
	mergeProps,
	removeObjValues,
	sortProps,
} from '../builder-utils.js'
import directiveParsers from './parsers/directive-parsers.js'
import propParsers from './parsers/prop-parsers.js'
import { CreateBlock } from './create-block.js'
import { BlockTemplateData } from './data-factories.js'
import { parseCollisionBox } from './parsers/collision-box.js'
import { getPermutationName, getPermutationTitle } from './generator-utils.js'
import appData from '../../app-data.js'

/**
 * Compile valid Minecraft properties from template props and prepared data.
 *
 * Called from CreateBlock.make()
 *
 * @param {CreateBlock.Block} block
 */
export function BlockCompiler( block ) {
	/** @type {CreateBlock.BlockCompiler} */
	const blockCompiler = {
		get block() {
			return block
		},
		get directiveParsers() {
			return directiveParsers
		},
		get propParsers() {
			return propParsers
		},

		addStaticProps,
		addTags,
		compatibilityCheck,
		compile,
		filterEmpty,
		newCompiler,
		parseCollisionBox,
		prefixComponentProps,
	}

	/**
	 *  Wrap block props in minecraft block skeleton with some default props.
	 */
	function finalizeBlock() {
		const { props, blockInfo } = block.data
		props.description.identifier = `${ appData.settings.prefix }:${ blockInfo.identifier }`

		const template = _.cloneDeep( appData.generatorData.scaffolding )

		block.data.block = mergeProps( template, {
			'minecraft:block': props.export(),
		} )
	}

	/**
	 * Add static props - Add directly, no processing. Overwrite existing props.
	 */
	function addStaticProps() {
		const { props, static: staticProps } = block.data.source
		const staticDataArr = Object.entries( staticProps )

		if ( ! staticDataArr.length ) {
			return block
		}

		mergeProps( props, sortProps( staticProps ) )

		staticDataArr.forEach( ( [ key ] ) => delete staticProps[ key ] )
	}

	function addTags() {
		const { props } = block.data
		const { tags } = block.data.source
		props.components = Object.assign( props.components, tags )
	}

	function prefixComponentProps() {
		const { props } = block.data
		if ( props.components && Object.keys( props.components ).length ) {
			props.components = recursivePrefixer(
				props.components,
				'minecraft:',
			)
		}
	}

	/**
	 * Remove null/undefined values and empty objects.
	 */
	function filterEmpty() {
		const { props } = block.data
		removeObjValues( props, [ null, undefined ] )

		if ( props.events && ! Object.keys( props.events ).length ) {
			delete props.events
		}

		if ( props.permutations && ! Object.keys( props.permutations ).length ) {
			delete props.permutations
		}
	}

	/**
	 * Check block source props for compatibility with configured MC format version, update if possible.
	 */
	function compatibilityCheck() {
		const { props } = block.data.source

		reducer( formatVersionCompatibilityTable, ( _block, [ oldKey, newKey ] ) => {
			if ( props[ oldKey ] !== undefined ) {
				if ( typeof newKey === 'string' ) {
					props[ newKey ] = props[ oldKey ]
				}
				else if ( Array.isArray( newKey ) ) {
					setObjValueByPath( _block, newKey, props[ oldKey ] )
				}

				delete props[ oldKey ]
			}

			return _block
		}, props )
	}

	/**
	 * @param {JSO} props
	 */
	function newCompiler( props ) {
		const data = BlockTemplateData( props )
		const newBlock = CreateBlock( data, block.data.blockInfo )
		return BlockCompiler( newBlock )
	}

	/**
	 * @param {boolean} finalize
	 * @return {GeneratedBlockData}
	 */
	function compile( finalize = true ) {
		const { extraVars, source } = block.data
		const data = { props: source.props, dir: source.dir }
		const vars = {
			...extraVars,
			...source.vars,
		}

		resolveRefsRecursively( data, vars, { mutateSource: true } )
		resolveTemplateStringsRecursively( data, vars, { mutateSource: true } )

		compatibilityCheck()

		// Parse directives and then props
		applyActions(
			blockCompiler,
			...Object.values( directiveParsers ),
			...Object.values( propParsers ),
		)

		// Finalize components
		addStaticProps()
		addTags()
		prefixComponentProps()
		filterEmpty()

		if ( ! finalize ) {
			return {
				source,
				block: block.data.props.export(),
				identifier: undefined,
				title: undefined,
				permutationData: block.permutationInfo,
			}
		}

		// Finalize block
		const { blockInfo } = block.data
		blockInfo.identifier = getPermutationName( block.permutationInfo.data )
		blockInfo.title = getPermutationTitle( block.permutationInfo.data )

		finalizeBlock()

		return {
			source,
			block: block.data.block,
			identifier: blockInfo.identifier,
			title: blockInfo.title,
			permutationData: block.permutationInfo,
		}
	}

	return blockCompiler
}
