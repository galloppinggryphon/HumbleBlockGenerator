'use strict'

import { removeObjValues } from './builder-utils.js'

const obj = {
	hello: {
		world: 22,
		null: null,
		undef: undefined,
		deepObj: {
			delete: {
				me: null,
				helloMyNameIsArray: [ 1, null, 2, 3 ],
			},
		},
	},
	array: [ {
		value: 1,
		isNull: null,
		child: {
			imthetruechild: true,
			imthenullchild: null,
			imtheundefinedchild: undefined,

		},
	} ],
}

const result = removeObjValues( obj, [ null, undefined, 22 ] )

result

result
