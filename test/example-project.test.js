const { spawn, exec } = require('child_process');
const path = require('path');
const unzipper = require('unzipper');
const fs = require('fs');

jest.setTimeout(600000);

test('included node modules in example project make sense', done => {
  const projectDir = path.join(__dirname, 'example-project');
  console.log('Example project directory', projectDir);

  // spawn('npm', ['link', '../..'], { cwd: projectDir }).on('close', code => {
  //   expect(code).toBe(0);
  //   console.log('Linked npm package');

  //   spawn('sls', ['package'], { cwd: projectDir }).on('close', code => {
  //     expect(code).toBe(0);
  // });

  const serverlessZipPath = path.join(projectDir, '.serverless', 'index.zip');

  if (!fs.existsSync(serverlessZipPath)) throw new Error('Run `npm run prepare-tests` in test/example-project');

  const onIsStringFound = jest.fn(() => {});
  const onIsObjectFound = jest.fn(() => {});
  const onIsArrayFound = jest.fn(() => {});
  const onAwsSdkFound = jest.fn(() => {});
  
  fs.createReadStream(serverlessZipPath)
    .pipe(unzipper.Parse())
    .on('entry', function (entry) {
      switch (entry.path) {
        case 'node_modules/is-string/package.json':
          onIsStringFound();
          break;
        case 'node_modules/is-object/package.json':
          onIsObjectFound();
          break;
        case 'node_modules/is-array/package.json':
          onIsArrayFound();
          break;
        case 'node_modules/aws-sdk/package.json':
          onAwsSdkFound();
          break;
      }

      entry.autodrain();
    }).on('close', () => {
      expect(onIsStringFound.mock.calls.length).toBe(1);
      expect(onIsObjectFound.mock.calls.length).toBe(1);
      expect(onIsArrayFound.mock.calls.length).toBe(0);
      expect(onAwsSdkFound.mock.calls.length).toBe(0);
      done();
    });
});

test('handler has correct require statements', () => {
  const projectDir = path.join(__dirname, 'example-project');

  const handlerFilePath = path.join(projectDir, 'handler.js');

  if (!fs.existsSync(handlerFilePath)) throw new Error('Run `npm run prepare-tests` in test/example-project');

  const contents = fs.readFileSync(handlerFilePath, 'utf-8');

  expect(contents).toMatch(/require\('aws-sdk'\)/);
  expect(contents).not.toMatch(/require\('is-array'\)/);
  expect(contents).toMatch(/require\('is-string'\)/);
  expect(contents).toMatch(/require\('is-object'\)/);
});
