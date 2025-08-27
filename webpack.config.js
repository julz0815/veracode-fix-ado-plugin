const path = require('path');

module.exports = {
    entry: {
        'veracode-fix-pr-tab': './src/pr-tab/veracode-fix-pr-tab.tsx',
        'veracode-fix-pipeline-tab': './src/pipeline-tab/veracode-fix-pipeline-tab.tsx'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        modules: [
            path.resolve(__dirname, 'node_modules'),
            'node_modules'
        ],
        alias: {
            'azure-devops-ui': path.resolve(__dirname, 'node_modules/azure-devops-ui'),
            'azure-devops-extension-sdk': path.resolve(__dirname, 'node_modules/azure-devops-extension-sdk')
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.webpack.json'
                    }
                },
                exclude: /node_modules/
            }
        ]
    },
    mode: 'production'
}; 