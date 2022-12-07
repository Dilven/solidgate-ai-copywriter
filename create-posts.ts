import * as dotenv from 'dotenv'
dotenv.config()
import * as core from '@actions/core'
import csv from 'csvtojson'
import { gql, GraphQLClient } from 'graphql-request'
import { Configuration, OpenAIApi } from 'openai';

// @ts-ignore
import Diacritics from 'diacritic';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const createContent = async (title: string) => {
  const openaiPrompt = `Treśc artykułu na bloga o tytule "${title}"`
  const response = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: openaiPrompt,
    temperature: 0.5,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0.6,
    best_of: 1,
    max_tokens: 3000
  });
  const content = response.data.choices[0].text
  if (!content) throw new Error(`could not create content for post - ${title}`);
  return content

};

const createPost = async (title: string, content: string, releaseInDays: number) => {
  const token = process.env.HYGRAPH_TOKEN
  if (!token) throw new Error('You need to set token for hygraph API')

  const authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  const apiUrl = process.env.HYGRAPH_API_URL;
  if (!apiUrl) throw new Error('You need to set API_URL for hygraph');

  const graphQLClient = new GraphQLClient(apiUrl, {
    headers: {
      authorization,
    },
  })

  const mutationCreatePost = gql`
  mutation CreatePost($title: String!, $content: String!, $slug: String!) {
    createPost(data: { title: $title, content: $content, slug: $slug }) {
      title
      content
      id
    }
  }
`

  const mutationSchedulePublishPost = gql`
mutation SchedulePublishPost($id: ID!, $releaseAt: DateTime!) {
  schedulePublishPost(where: {id: $id}, to: PUBLISHED, releaseAt: $releaseAt) {
    id
  }
}
`

  const slug = Diacritics.clean(title)
    .toLowerCase()
    .replace(/\s+/g, '-')    // Replace spaces with -
    .replace(/[^-a-zа-я\u0370-\u03ff\u1f00-\u1fff]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-')    // Replace multiple - with single -
    .replace(/^-+/, '')      // Trim - from start of text
    .replace(/-+$/, '')      // Trim - from end of text;

  const { createPost: post } = await graphQLClient.request<{ createPost: { id: string, title: string, content: string } }>(mutationCreatePost, {
    title,
    content,
    slug
  })

  const releaseAt = new Date();
  releaseAt.setDate(releaseAt.getDate() + releaseInDays)

  await graphQLClient.request(mutationSchedulePublishPost, { id: post.id, releaseAt: releaseAt.toISOString() })
  return post
}

const BATCH_SIZE = 5 // max is 10 per 1 minute

const getBatches = <T>(arr: T[], deletedCount: number) => {
  const res: T[][] = []
  while (arr.length) {
    res.push(arr.splice(0, deletedCount))
  }
  return res
}

export const delayMS = (t = 1000) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(t);
    }, t);
  });
};


(async () => {
  const titles: { title: string }[] = await csv().fromFile(
    './post-titles.csv'
  )

  const batches = getBatches(titles, BATCH_SIZE)

  for (const [index, batch] of Object.entries(batches)) {
    await Promise.all(batch.map(async ({ title }, index) => {
      core.info(`Creating post - ${title}`)
      const content = await createContent(title)
      core.info(`Content created - ${title}`)
      const releaseInDays = (index + 1) * 2
      const post = await createPost(title, content, releaseInDays);
      core.info(`Created post id -${post.id}`)
    }))
    core.info(`Wait 1 minute for next batch`)
    const isLastBatch = Number(index) + 1 === batches.length
    if (!isLastBatch) await delayMS(60000)
  }
})()


