<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Service;

use \RuntimeException;
use OCA\Talk\Participant;
use OCA\Talk\Room;
use OCP\App\IAppManager;
use OCP\Http\Client\IResponse;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

class LiveTranscriptionService {

	public function __construct(
		private ?string $userId,
		private IAppManager $appManager,
		private IUserManager $userManager,
		protected LoggerInterface $logger,
	) {
	}

	public function isLiveTranscriptionAppEnabled(?object $appApiPublicFunctions = null): bool {
		try {
			if ($appApiPublicFunctions ===  null) {
				$appApiPublicFunctions = $this->getAppApiPublicFunctions();
			}
		} catch (\RuntimeException $e) {
			return false;
		}

		$exApp = $appApiPublicFunctions->getExApp('live_transcription');
		if ($exApp === null || !$exApp['enabled']) {
			return false;
		}

		return true;
	}

	private function getAppApiPublicFunctions(): object {
		if (!$this->appManager->isEnabledForUser('app_api')) {
			throw new RuntimeException('app-api');
		}

		try {
			$appApiPublicFunctions = \OCP\Server::get(\OCA\AppAPI\PublicFunctions::class);
		} catch (ContainerExceptionInterface|NotFoundExceptionInterface $e) {
			throw new RuntimeException('app-api-functions');
		}

		return $appApiPublicFunctions;
	}

	/**
	 * @throws RuntimeException if the external app "live_transcription" is not
	 *         available, or if the request failed.
	 */
	public function enable(Room $room, Participant $participant): void {
		$params = [
			'roomToken' => $room->getToken(),
			'sessionId' => $participant->getSession()->getSessionId(),
			'enable' => true,
		];

		$this->requestToExAppLiveTranscription('/transcribeCall', $params);
	}

	/**
	 * @throws RuntimeException if the external app "live_transcription" is not
	 *         available, or if the request failed.
	 */
	public function disable(Room $room, Participant $participant): void {
		$params = [
			'roomToken' => $room->getToken(),
			'sessionId' => $participant->getSession()->getSessionId(),
			'enable' => false,
		];

		$this->requestToExAppLiveTranscription('/transcribeCall', $params);
	}

	/**
	 * @throws RuntimeException if the external app "live_transcription" is not
	 *         available, or if the request failed.
	 */
	private function requestToExAppLiveTranscription(string $route, array $params): IResponse {
		try {
			$appApiPublicFunctions = $this->getAppApiPublicFunctions();
		} catch (RuntimeException $e) {
			if ($e->getMessage() === 'app-api') {
				$this->logger->error('AppAPI is not enabled');
			} else if ($e->getMessage() === 'app-api-functions') {
				$this->logger->error('Could not get AppAPI public functions', ['exception' => $e]);
			}
			throw $e;
		}

		if (!$this->isLiveTranscriptionAppEnabled($appApiPublicFunctions)) {
			$this->logger->error('External app live_transcription is not enabled');
			throw new RuntimeException('live-transcription-app');
		}

		$response = $appApiPublicFunctions->exAppRequest(
			'live_transcription',
			$route,
			$this->userId,
			'POST',
			$params,
		);

		if (is_array($response) && isset($response['error'])) {
			$this->logger->error('Request to external app live_transcription failed: ' . $response['error']);
			throw new RuntimeException('request');
		}
		if (is_array($response)) {
			// AppApi only uses array responses for errors, so this should never
			// happen.
			$this->logger->error('Request to external app live_transcription failed: response is not a valid response object');
			throw new RuntimeException('response');
		}

		return $response;
	}
}
