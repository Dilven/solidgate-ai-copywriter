import * as core from '@actions/core'
import csv from 'csvtojson'
import { parse } from 'json2csv'
import * as fs from 'fs';

const createMarkdownFile = (title: string, content: string) => {
  const data = `
  ---
  title: "${title}"
  date: "${new Date().toLocaleDateString("pl-PL", {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}"
  excerpt: "test"
  ---
  ${content}
  [Kontakt](www.solidgate.pl/kontakt)
  `

  fs.writeFileSync(`./solidgate/posts/${title.replace(/\s/g, "-").toLowerCase()}.md`, data)
};

(async () => {
  const [newPost,...restTitles]: { title: string }[] = await csv().fromFile(
    './post-titles.csv'
  )
  if(!newPost) {
    core.error('No posts to publish')
  }
  core.info(`Creating post - ${newPost.title}`)
  const content = 'test content';
  createMarkdownFile(newPost.title, content)
  const updatedTitles = parse(restTitles, { header: true })
  fs.promises.writeFile('./post-titles.csv', updatedTitles)
  core.info('Created post')
})()


