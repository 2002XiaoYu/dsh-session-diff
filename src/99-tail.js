		// Only module.exports is relied on: the loader takes the factory's return
		// value, so nothing here needs a bare `exports` binding to exist.
		module.exports.apply = apply;
		module.exports.inject = inject;
		return module.exports;
	}
});
