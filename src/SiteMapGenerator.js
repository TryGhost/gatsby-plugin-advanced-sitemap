import extend from 'lodash/extend';
import BaseSiteMapGenerator from './BaseSiteMapGenerator';

export default class SiteMapGenerator extends BaseSiteMapGenerator {
    constructor(opts, type) {
        super();

        this.name = type || `pages`;

        extend(this, opts);
    }
}
