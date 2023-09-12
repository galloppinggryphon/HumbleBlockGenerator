'use strict'
import {
	reducer,
	recursivePrefixer,
	resolveTemplateStringsRecursively,
	resolveRefsRecursively,
	setObjValueByPath,
} from '../../lib/utils.js'
import { formatVersionCompatibilityTable } from '../generator-config.js'
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

	function compile() {
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

		// Finalize block
		addStaticProps()
		addTags()
		prefixComponentProps()
		filterEmpty()
	}

	return blockCompiler
}
